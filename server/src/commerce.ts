import { createHash, randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { currentUser, type AuthUser } from "./auth.js";
import { pool, query } from "./db.js";
import { config } from "./config.js";
import { createNotification } from "./notifications.js";
import { appendAudit, highValueThreshold, withAuditTransaction } from "./auditLedger.js";

export const commerceRouter = Router();
const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);
const protect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await currentUser(req);
    if (!user) { res.status(401).json({ error: "Sign in to continue." }); return; }
    res.locals.user = user;
    next();
  } catch (error) { next(error); }
};
const productFields = 'p.id, p.sku, p.name, p.description, p.category, p.price_ugx AS "priceUgx", p.available_units AS "availableUnits", p.image_url AS "imageUrl", p.image_urls AS "imageUrls", p.condition, p.compatibility, p.specifications, p.is_demo AS "isDemo", l.name AS "businessName", u.business_phone AS "businessPhone", u.business_whatsapp AS "businessWhatsapp", u.business_email AS "businessEmail", (l.verified AND l.moderation_status = \'approved\') AS "sellerVerified"';
const pesapalBase = process.env.PESAPAL_ENV === "live" ? "https://pay.pesapal.com/v3/api" : "https://cybqa.pesapal.com/pesapalv3/api";
const pesapalEnabled = Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET && process.env.PESAPAL_IPN_ID);
const moneyRequest = async (path: string, init?: RequestInit) => {
  // Never log the request body, authorization headers, bearer token, or the
  // complete provider response: any of those may contain payment secrets.
  const operation = path === "/Auth/RequestToken" ? "authentication"
    : path === "/Transactions/SubmitOrderRequest" ? "submit_order"
    : path === "/Transactions/GetTransactionStatus" ? "verify_payment"
    : "other";
  const response = await fetch(pesapalBase + path, { ...init, signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body || (body.error && typeof body.error === "object")) {
    const errorObject = body?.error && typeof body.error === "object"
      ? body.error as Record<string, unknown> : null;
    const rawCode = errorObject?.code ?? body?.error_code;
    const providerCode = typeof rawCode === "string" && /^[a-zA-Z0-9_.-]{1,64}$/.test(rawCode)
      ? rawCode : "unavailable";
    console.error("Pesapal API rejected request", {
      operation, environment: process.env.PESAPAL_ENV === "live" ? "live" : "sandbox",
      status: response.status, providerCode,
    });
    throw new Error("Payment service request failed. Please retry later.");
  }
  return body;
};
const pesapalToken = async () => {
  const result = await moneyRequest("/Auth/RequestToken", {
    method: "POST",
    body: JSON.stringify({ consumer_key: process.env.PESAPAL_CONSUMER_KEY, consumer_secret: process.env.PESAPAL_CONSUMER_SECRET }),
  });
  if (typeof result.token !== "string" || !result.token) throw new Error("Payment gateway authentication failed.");
  return result.token;
};
commerceRouter.get("/products", asyncRoute(async (_req, res) => {
  const products = await query('SELECT ' + productFields + ' FROM marketplace_products p JOIN listings l ON p.business_listing_id = l.id LEFT JOIN users u ON u.id = l.owner_id WHERE p.active = TRUE AND p.is_demo = FALSE AND l.moderation_status IN (\'pending\',\'approved\') ORDER BY p.created_at DESC');
  res.json({ products: products.rows, paymentAvailable: pesapalEnabled });
}));
// Server-side catalogue search; /products remains unchanged for older clients.
const catalogFilters = z.object({
  q: z.string().trim().max(120).default(""),
  category: z.string().trim().max(100).default(""),
  condition: z.enum(["New", "Used", "Refurbished"]).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
}).refine(x => x.minPrice === undefined || x.maxPrice === undefined || x.minPrice <= x.maxPrice, { message: "Minimum price cannot exceed maximum price." });
commerceRouter.get("/catalog", asyncRoute(async (req, res) => {
  const filters = catalogFilters.parse(req.query);
  const conditions = ["p.active=TRUE", "p.is_demo=FALSE", "l.moderation_status IN ('pending','approved')"];
  const values: unknown[] = [];
  const filter = (expression: string, value: unknown) => {
    values.push(value);
    conditions.push(expression.replace("?", "$" + values.length));
  };
  if (filters.q) {
    values.push("%" + filters.q + "%");
    const n = values.length;
    conditions.push("(p.name ILIKE $" + n + " OR p.description ILIKE $" + n + " OR p.compatibility ILIKE $" + n + ")");
  }
  if (filters.category) filter("p.category=?", filters.category);
  if (filters.condition) filter("p.condition=?", filters.condition);
  if (filters.minPrice !== undefined) filter("p.price_ugx>=?", filters.minPrice);
  if (filters.maxPrice !== undefined) filter("p.price_ugx<=?", filters.maxPrice);
  const from = " FROM marketplace_products p JOIN listings l ON p.business_listing_id=l.id LEFT JOIN users u ON u.id=l.owner_id WHERE " + conditions.join(" AND ");
  const count = await query<{total:string}>("SELECT COUNT(*)::text AS total" + from, values);
  const total = Number(count.rows[0]?.total || 0);
  const products = await query("SELECT " + productFields + from + " ORDER BY p.created_at DESC, p.id DESC LIMIT $" + (values.length + 1) + " OFFSET $" + (values.length + 2), [...values, filters.limit, (filters.page - 1) * filters.limit]);
  res.json({products: products.rows, pagination: {page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit)}});
}));

commerceRouter.get("/products/:id", asyncRoute(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const result = await query('SELECT ' + productFields + ' FROM marketplace_products p JOIN listings l ON p.business_listing_id = l.id LEFT JOIN users u ON u.id = l.owner_id WHERE p.id = $1 AND p.active = TRUE AND p.is_demo = FALSE AND l.moderation_status IN (\'pending\',\'approved\')', [id]);
  if (!result.rows.length) { res.status(404).json({ error: "Product not found." }); return; }
  res.json({ product: result.rows[0] });
}));

const managedItemSchema = z.object({
  name:z.string().trim().min(3).max(160),
  description:z.string().trim().min(5).max(2000),
  category:z.string().trim().min(2).max(100),
  priceUgx:z.number().int().min(100).max(1_000_000_000),
  availableUnits:z.number().int().min(0).max(1_000_000),
  imageUrls:z.array(z.string().trim().max(350_000).refine(v => /^data:image\/(?:jpeg|png|webp);base64,/.test(v) || /^https:\/\//.test(v), "Provide compressed JPEG, PNG or WebP photos.")).min(1).max(3),
  condition:z.enum(["New","Used","Refurbished"]),
  compatibility:z.string().trim().max(300).default(""),
  active:z.boolean().optional(),
});
commerceRouter.get("/my-products", protect, asyncRoute(async (_req,res)=>{
  const user=res.locals.user as AuthUser;
  if (!["shop","technician"].includes(user.role)){res.status(403).json({error:"Provider account required."});return;}
  const result=await query('SELECT id, sku, name, description, category, price_ugx AS "priceUgx", available_units AS "availableUnits", image_url AS "imageUrl", image_urls AS "imageUrls", condition, compatibility, active FROM marketplace_products WHERE owner_id = $1 AND is_demo = FALSE ORDER BY created_at DESC',[user.id]);
  res.json({products:result.rows});
}));
commerceRouter.post("/my-products", protect, asyncRoute(async (req,res)=>{
  const user=res.locals.user as AuthUser;
  if (!["shop","technician"].includes(user.role)){res.status(403).json({error:"Provider account required."});return;}
  const data=managedItemSchema.omit({active:true}).parse(req.body);
  const business=await query<{id:string}>('SELECT id FROM listings WHERE owner_id=$1 ORDER BY created_at ASC LIMIT 1',[user.id]);
  if (!business.rows[0]){res.status(409).json({error:"Create your business profile before adding inventory."});return;}
  const productId=await withAuditTransaction(async client=>{
    const result=await client.query<{id:string}>('INSERT INTO marketplace_products (owner_id,business_listing_id,sku,name,description,category,price_ugx,available_units,image_url,image_urls,condition,compatibility,is_demo,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,TRUE) RETURNING id',
      [user.id,business.rows[0].id,"GURA-"+randomUUID().slice(0,12).toUpperCase(),data.name,data.description,data.category,data.priceUgx,data.availableUnits,data.imageUrls[0],data.imageUrls,data.condition,data.compatibility]);
    const id=result.rows[0].id;
    await appendAudit(client,{actorId:user.id,action:"product.created",subjectType:"product",subjectId:id,
      detail:{priceUgx:data.priceUgx,availableUnits:data.availableUnits}});
    return id;
  });
  res.status(201).json({id:productId});
}));
commerceRouter.patch("/my-products/:id",protect,asyncRoute(async (req,res)=>{
  const user=res.locals.user as AuthUser;
  if (!["shop","technician"].includes(user.role)){res.status(403).json({error:"Provider account required."});return;}
  const id=z.string().uuid().parse(req.params.id);
  const data=managedItemSchema.partial().parse(req.body);
  const updated=await withAuditTransaction(async client=>{
    const result=await client.query(
      "UPDATE marketplace_products SET name=COALESCE($1,name),description=COALESCE($2,description),category=COALESCE($3,category),price_ugx=COALESCE($4,price_ugx),available_units=COALESCE($5,available_units),image_url=COALESCE($6,image_url),image_urls=COALESCE($7,image_urls),condition=COALESCE($8,condition),compatibility=COALESCE($9,compatibility),active=COALESCE($10,active) WHERE id=$11 AND owner_id=$12 AND is_demo=FALSE RETURNING id",
      [data.name??null,data.description??null,data.category??null,data.priceUgx??null,data.availableUnits??null,data.imageUrls?.[0]??null,data.imageUrls??null,data.condition??null,data.compatibility??null,data.active??null,id,user.id],
    );
    if(!result.rowCount)return false;
    await appendAudit(client,{actorId:user.id,action:"product.updated",subjectType:"product",subjectId:id,
      detail:{...(data.priceUgx!==undefined?{priceUgx:data.priceUgx}:{}),
        ...(data.availableUnits!==undefined?{availableUnits:data.availableUnits}:{}),
        ...(data.active!==undefined?{active:data.active}:{})}});
    return true;
  });
  if(!updated){res.status(404).json({error:"Product not found in your business."});return;}
  res.json({id});
}));
commerceRouter.get("/orders", protect, asyncRoute(async (_req, res) => {
  const user = res.locals.user as AuthUser;
  const result = await query(
    'SELECT id, status, payment_method AS "paymentMethod", phone_number AS "phoneNumber", amount_ugx AS "amountUgx", (payment_tracking_id IS NOT NULL) AS "paymentInitiated", created_at AS "createdAt", paid_at AS "paidAt" FROM marketplace_orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50',
    [user.id],
  );
  const ids = result.rows.map(item => item.id);
  const items = ids.length ? await query(
    'SELECT order_id AS "orderId", product_id AS "productId", quantity, price_ugx AS "priceUgx", product_name AS "name" FROM marketplace_order_items WHERE order_id = ANY($1::uuid[])', [ids],
  ) : { rows: [] };
  res.json({ orders: result.rows.map(order => ({ ...order, items: items.rows.filter(item => item.orderId === order.id) })) });
}));

const orderInput = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).min(1).max(30),
  paymentMethod: z.enum(["mtn","airtel","card"]),
  phoneNumber: z.string().trim().regex(/^(?:\+?256|0)7[0-9]{8}$/).optional(),
});
commerceRouter.post("/orders", protect, asyncRoute(async (req, res) => {
  const user = res.locals.user as AuthUser;
  // Any authenticated GURA account may place an order, regardless of account role.
  const input = orderInput.parse(req.body);
  const combined = new Map<string, number>();
  for (const item of input.items) combined.set(item.productId, (combined.get(item.productId) || 0) + item.quantity);
  if ([...combined.values()].some(qty => qty > 20)) { res.status(400).json({ error: "Maximum 20 units per product." }); return; }
  const client = await pool.connect();
  let orderId = "";
  let status = "";
  let total = 0;
  try {
    await client.query("BEGIN");
    const ids = [...combined.keys()];
    const found = await client.query<{id: string;name: string;price_ugx:number;available_units:number;is_demo:boolean}>(
      "SELECT p.id,p.name,p.price_ugx,p.available_units,p.is_demo FROM marketplace_products p JOIN listings l ON p.business_listing_id=l.id WHERE p.id=ANY($1::uuid[]) AND p.active=TRUE AND l.moderation_status IN ('pending','approved') FOR SHARE OF p", [ids],
    );
    if (found.rows.length !== ids.length) { res.status(400).json({ error: "Some products are no longer available." }); await client.query("ROLLBACK"); return; }
    for (const product of found.rows) {
      const qty = combined.get(product.id)!;
      if (product.available_units < qty) { res.status(409).json({ error: product.name + " has only " + product.available_units + " units available." }); await client.query("ROLLBACK"); return; }
      total += product.price_ugx * qty;
    }
    const demo = found.rows.some(product => product.is_demo);
    if (demo) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "This item is not available for purchase. Please select a live supplier product." });
      return;
    }
    if (!demo && input.paymentMethod !== "card" && !input.phoneNumber) { await client.query("ROLLBACK"); res.status(400).json({ error: "Enter the mobile money phone number." }); return; }
    status = demo ? "demo" : "pending_payment";
    const result = await client.query<{id:string}>(
      "INSERT INTO marketplace_orders(customer_id,status,payment_method,phone_number,amount_ugx) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [user.id,status,input.paymentMethod,input.phoneNumber ?? null,total],
    );
    orderId = result.rows[0].id;
    for (const product of found.rows) await client.query(
      "INSERT INTO marketplace_order_items(order_id,product_id,quantity,price_ugx,product_name) VALUES($1,$2,$3,$4,$5)",
      [orderId,product.id,combined.get(product.id),product.price_ugx,product.name],
    );
    // Bind the receipt to the complete product/quantity/price snapshot without
    // exposing the customer's phone number or other private payment information.
    const itemsSnapshot=found.rows.map(product=>({
      productId:product.id,quantity:combined.get(product.id)!,unitPriceUgx:product.price_ugx,
    })).sort((a,b)=>a.productId.localeCompare(b.productId));
    const itemsHash=createHash("sha256").update(JSON.stringify(itemsSnapshot)).digest("hex");
    await appendAudit(client, {actorId:user.id,action:"order.created",subjectType:"order",subjectId:orderId,
      detail:{amountUgx:total,status,paymentMethod:input.paymentMethod,itemCount:combined.size,itemsHash},
      highValue:total>=highValueThreshold});
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  try {
    await createNotification(user.id, status === "demo" ? "Demo order created" : "Order received — payment pending",
      "Order " + orderId.slice(0,8).toUpperCase() + " (" + total.toLocaleString("en-UG") + " UGX). " +
      (status === "demo" ? "Sample order only: no payment will be collected and no items will be shipped." : "Your order is awaiting verified payment."));
  } catch (error) {
    console.error("Unable to record order notification", error);
  }
  res.status(201).json({ order: { id:orderId,status,amountUgx:total }, paymentAvailable:pesapalEnabled && status !== "demo" });
}));

commerceRouter.post("/orders/:id/pay", protect, asyncRoute(async (req,res) => {
  const user = res.locals.user as AuthUser;
  const id = z.string().uuid().parse(req.params.id);
  const order = await query<{id:string;status:string;amount_ugx:number;payment_method:string;phone_number:string|null;payment_tracking_id:string|null}>(
    "SELECT id,status,amount_ugx,payment_method,phone_number,payment_tracking_id FROM marketplace_orders WHERE id=$1 AND customer_id=$2",
    [id,user.id],
  );
  const item = order.rows[0];
  if (!item) { res.status(404).json({error:"Order not found."}); return; }
  if (item.status === "demo") { res.status(400).json({error:"Sample products are for preview only. Payment is disabled for demo orders."}); return; }
  if (item.status !== "pending_payment") { res.status(409).json({error:"This order cannot be paid in its current status."}); return; }
  if (!pesapalEnabled) { res.status(503).json({error:"Secure payment processing has not been activated. Your order remains unpaid."}); return; }
  if (item.payment_tracking_id) { res.status(409).json({error:"Payment was already initiated. Check order status instead."}); return; }
  const token = await pesapalToken();
  const result = await moneyRequest("/Transactions/SubmitOrderRequest", {
    method:"POST",
    headers:{Authorization:"Bearer "+token},
    body:JSON.stringify({
      id:item.id,amount:item.amount_ugx,currency:"UGX",
      description:"GURA order "+item.id.slice(0,8),
      callback_url:config.webOrigin+"/orders?returned=1",
      notification_id:process.env.PESAPAL_IPN_ID,
      billing_address:{email_address:user.email,phone_number:item.phone_number || undefined,first_name:user.name.split(" ")[0],last_name:user.name.split(" ").slice(1).join(" "),country_code:"UG"},
    }),
  });
  if(typeof result.order_tracking_id !== "string" || typeof result.redirect_url !== "string") throw new Error("Payment gateway did not provide a checkout link.");
  const trackingId: string = result.order_tracking_id;
  const url = new URL(result.redirect_url);
  if (!["cybqa.pesapal.com","pay.pesapal.com"].includes(url.hostname) || url.protocol!=="https:") throw new Error("Unexpected payment destination.");
  const recorded=await withAuditTransaction(async client=>{
    const changed=await client.query(
      "UPDATE marketplace_orders SET payment_tracking_id=$1 WHERE id=$2 AND payment_tracking_id IS NULL AND status='pending_payment' RETURNING id",
      [trackingId,id],
    );
    if(!changed.rowCount)return false;
    await appendAudit(client,{actorId:user.id,action:"payment.initiated",
      subjectType:"order",subjectId:id,detail:{amountUgx:item.amount_ugx,
        trackingHash:createHash("sha256").update(trackingId).digest("hex")},
      highValue:Number(item.amount_ugx)>=highValueThreshold});
    return true;
  });
  if(!recorded){res.status(409).json({error:"Payment was already initiated. Check order status instead."});return;}
  res.json({redirectUrl:url.toString()});
}));

const syncPayment = async (trackingId:string) => {
  if (!pesapalEnabled) return;
  const existing = await query<{id:string;status:string;customer_id:string;amount_ugx:number}>(
    "SELECT id,status,customer_id,amount_ugx FROM marketplace_orders WHERE payment_tracking_id=$1", [trackingId],
  );
  const order=existing.rows[0];
  if(!order || order.status!=="pending_payment") return;
  const token=await pesapalToken();
  const info=await moneyRequest("/Transactions/GetTransactionStatus?orderTrackingId="+encodeURIComponent(trackingId),{headers:{Authorization:"Bearer "+token}});
  if (info.merchant_reference!==order.id || info.currency!=="UGX" || Number(info.amount)!==Number(order.amount_ugx)) return;
  const state=String(info.payment_status_description||"").toUpperCase();
  if(state==="COMPLETED") {
    // Sandbox payments are never recognized as real funds or deducted from live stock.
    if (process.env.PESAPAL_ENV !== "live") {
      const changed = await withAuditTransaction(async client => {
        const test = await client.query(
          "UPDATE marketplace_orders SET status='sandbox_paid' WHERE id=$1 AND status='pending_payment' RETURNING id",
          [order.id],
        );
        if (test.rowCount) await appendAudit(client,{actorId:null,action:"payment.sandbox_confirmed",
          subjectType:"order",subjectId:order.id,detail:{amountUgx:order.amount_ugx,status:"sandbox_paid"},
          highValue:Number(order.amount_ugx)>=highValueThreshold});
        return !!test.rowCount;
      });
      if (changed) await createNotification(order.customer_id,"Sandbox payment verified — test only","GURA test order "+order.id.slice(0,8).toUpperCase()+" completed in the payment sandbox. No real money was collected and no stock was deducted.");
      return;
    }
    const client=await pool.connect();
    let success=false;
    try {
      await client.query("BEGIN");
      const lock=await client.query<{status:string}>("SELECT status FROM marketplace_orders WHERE id=$1 FOR UPDATE",[order.id]);
      if(lock.rows[0]?.status==="pending_payment"){
        const items=await client.query<{product_id:string;quantity:number}>("SELECT product_id,quantity FROM marketplace_order_items WHERE order_id=$1",[order.id]);
        for(const item of items.rows){
          const updated=await client.query("UPDATE marketplace_products SET available_units=available_units-$1 WHERE id=$2 AND available_units >= $1 RETURNING id",[item.quantity,item.product_id]);
          if(!updated.rowCount) throw new Error("Insufficient inventory to fulfill paid order "+order.id);
        }
        await client.query("UPDATE marketplace_orders SET status='paid',paid_at=now() WHERE id=$1",[order.id]);
        await appendAudit(client,{actorId:null,action:"payment.confirmed",
          subjectType:"order",subjectId:order.id,detail:{amountUgx:order.amount_ugx,status:"paid"},
          highValue:Number(order.amount_ugx)>=highValueThreshold});
        success=true;
      }
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    if(success) await createNotification(order.customer_id,"Payment confirmed — order received","Payment verified for GURA order "+order.id.slice(0,8).toUpperCase()+". We have received your order.");
  } else if(state==="FAILED"||state==="REVERSED"){
    await withAuditTransaction(async client=>{
      const result=await client.query("UPDATE marketplace_orders SET status='failed' WHERE id=$1 AND status='pending_payment' RETURNING id",[order.id]);
      if(result.rowCount) await appendAudit(client,{actorId:null,action:"payment.failed",
        subjectType:"order",subjectId:order.id,detail:{amountUgx:order.amount_ugx,status:"failed"},
        highValue:Number(order.amount_ugx)>=highValueThreshold});
    });
    await createNotification(order.customer_id,"Order payment "+state.toLowerCase(),"Payment for order "+order.id.slice(0,8).toUpperCase()+" was not confirmed.");
  }
};
// An order owner can download the evidence hashes and proof tags. HMAC verification
// itself is server-side; unlike a customer-held digital signature, this is not
// independent proof that the human account owner authorized the purchase.
commerceRouter.get("/orders/:id/audit-receipt", protect, asyncRoute(async (req,res)=>{
  const user=res.locals.user as AuthUser;
  const id=z.string().uuid().parse(req.params.id);
  const owned=await query("SELECT id FROM marketplace_orders WHERE id=$1 AND customer_id=$2",[id,user.id]);
  if(!owned.rowCount){res.status(404).json({error:"Order not found."});return;}
  const evidence=await query(
    `SELECT id::text,action,subject_id AS "orderId",details,occurred_at AS "occurredAt",
       previous_hash AS "previousHash",entry_hash AS "entryHash",signature,
       high_value AS "highValue"
     FROM secure_audit_ledger WHERE subject_type='order' AND subject_id=$1 ORDER BY id`,
    [id],
  );
  res.json({orderId:id,entries:evidence.rows});
}));

commerceRouter.get("/orders/:id/verify", protect, asyncRoute(async (req,res)=>{
  const user=res.locals.user as AuthUser;
  const id=z.string().uuid().parse(req.params.id);
  const result=await query<{payment_tracking_id:string|null}>("SELECT payment_tracking_id FROM marketplace_orders WHERE id=$1 AND customer_id=$2",[id,user.id]);
  if(!result.rows[0]){res.status(404).json({error:"Order not found."});return;}
  if(result.rows[0].payment_tracking_id) await syncPayment(result.rows[0].payment_tracking_id);
  const updated=await query<{status:string}>("SELECT status FROM marketplace_orders WHERE id=$1",[id]);
  res.json({status:updated.rows[0].status});
}));
commerceRouter.all("/payment-ipn", asyncRoute(async(req,res)=>{
  const raw=req.method==="GET"?req.query:req.body;
  const tracking=raw?.OrderTrackingId;
  if(typeof tracking==="string" && /^[a-zA-Z0-9-]{10,100}$/.test(tracking)){
    try{await syncPayment(tracking);}catch(error){console.error("Payment reconciliation error",error);res.status(503).json({error:"Payment verification unavailable"});return;}
  }
  res.status(200).json({orderNotificationType:raw?.OrderNotificationType||"IPNCHANGE",orderTrackingId:tracking||""});
}));
