import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { currentUser, type AuthUser } from "./auth.js";
import { pool, query } from "./db.js";
import { config } from "./config.js";
import { createNotification } from "./notifications.js";

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
const productFields = 'id, sku, name, description, category, price_ugx AS "priceUgx", available_units AS "availableUnits", image_url AS "imageUrl", condition, compatibility, specifications, is_demo AS "isDemo"';
const pesapalBase = process.env.PESAPAL_ENV === "live" ? "https://pay.pesapal.com/v3/api" : "https://cybqa.pesapal.com/pesapalv3/api";
const pesapalEnabled = Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET && process.env.PESAPAL_IPN_ID);
const moneyRequest = async (path: string, init?: RequestInit) => {
  const response = await fetch(pesapalBase + path, { ...init, signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.error && typeof body.error === "object") throw new Error("Payment service request failed. Please retry later.");
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
  const products = await query('SELECT ' + productFields + ' FROM marketplace_products WHERE active = TRUE AND is_demo = FALSE ORDER BY created_at ASC');
  res.json({ products: products.rows, paymentAvailable: pesapalEnabled });
}));
commerceRouter.get("/products/:id", asyncRoute(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const result = await query('SELECT ' + productFields + ' FROM marketplace_products WHERE id = $1 AND active = TRUE AND is_demo = FALSE', [id]);
  if (!result.rows.length) { res.status(404).json({ error: "Product not found." }); return; }
  res.json({ product: result.rows[0] });
}));
commerceRouter.get("/orders", protect, asyncRoute(async (_req, res) => {
  const user = res.locals.user as AuthUser;
  const result = await query(
    'SELECT id, status, payment_method AS "paymentMethod", phone_number AS "phoneNumber", amount_ugx AS "amountUgx", created_at AS "createdAt", paid_at AS "paidAt" FROM marketplace_orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50',
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
  if (user.role !== "customer") { res.status(403).json({ error: "Use a customer account to checkout." }); return; }
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
      "SELECT id,name,price_ugx,available_units,is_demo FROM marketplace_products WHERE id=ANY($1::uuid[]) AND active=TRUE FOR SHARE", [ids],
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
  const url = new URL(result.redirect_url);
  if (!["cybqa.pesapal.com","pay.pesapal.com"].includes(url.hostname) || url.protocol!=="https:") throw new Error("Unexpected payment destination.");
  await query("UPDATE marketplace_orders SET payment_tracking_id=$1 WHERE id=$2 AND payment_tracking_id IS NULL",[result.order_tracking_id,id]);
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
      const test = await query(
        "UPDATE marketplace_orders SET status='sandbox_paid' WHERE id=$1 AND status='pending_payment' RETURNING id",
        [order.id],
      );
      if (test.rowCount) await createNotification(order.customer_id,"Sandbox payment verified — test only","GURA test order "+order.id.slice(0,8).toUpperCase()+" completed in the payment sandbox. No real money was collected and no stock was deducted.");
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
        success=true;
      }
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    if(success) await createNotification(order.customer_id,"Payment confirmed — order received","Payment verified for GURA order "+order.id.slice(0,8).toUpperCase()+". We have received your order.");
  } else if(state==="FAILED"||state==="REVERSED"){
    await query("UPDATE marketplace_orders SET status='failed' WHERE id=$1 AND status='pending_payment'",[order.id]);
    await createNotification(order.customer_id,"Order payment "+state.toLowerCase(),"Payment for order "+order.id.slice(0,8).toUpperCase()+" was not confirmed.");
  }
};
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
