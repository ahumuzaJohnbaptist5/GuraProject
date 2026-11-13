import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Minus, Plus, ShoppingCart, Package, ShieldCheck, Store, Wrench, X, RefreshCcw } from "lucide-react";
import type { User } from "./types";
import { prepareListingPhotos } from "./listingPhotos";
import { fetchMarketplaceGet } from "./marketplaceFetch";

export type ShopProduct = {
  id:string; sku:string; name:string; description:string; category:string; priceUgx:number; availableUnits:number;
  imageUrl:string; imageUrls?:string[]; condition:string; compatibility:string; specifications:Record<string,string>; isDemo:boolean; sellerVerified?:boolean; businessName?:string; businessPhone?:string; businessWhatsapp?:string; businessEmail?:string;
};
type ProviderListing={id:string;name:string;type:"shop"|"technician"|"seller";location:string;text:string;images?:string[];verified:boolean;moderationStatus:"pending"|"approved"|"rejected";businessPhone?:string;businessWhatsapp?:string;businessEmail?:string};
type CartEntry={productId:string;quantity:number};
type Order={id:string;status:string;paymentMethod:string;amountUgx:number;createdAt:string;items:{productId:string;quantity:number;name:string;priceUgx:number}[]};
const KEY="gura-marketplace-cart";
const API_URL=import.meta.env.PROD?"":((import.meta.env.VITE_API_URL as string|undefined)?.trim() || "http://localhost:8787").replace(/\/+$/,"");
const money=(n:number)=>"UGX "+n.toLocaleString("en-UG");
const getCart=():CartEntry[]=>{try{const data=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(data)?data.filter((x:CartEntry)=>typeof x.productId==="string"&&Number.isInteger(x.quantity)&&x.quantity>0):[];}catch{return []}};
const storeCart=(items:CartEntry[])=>{localStorage.setItem(KEY,JSON.stringify(items));window.dispatchEvent(new Event("gura-cart-updated"));};
const request=async<T,>(path:string,init?:RequestInit):Promise<T>=>{
  const response=await fetch(API_URL+"/api/commerce"+path,{...init,credentials:"include",headers:{"Content-Type":"application/json",...(init?.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    if(response.status===429) throw new Error("The GURA service is temporarily limiting requests. Please try again shortly. If this continues, contact support.");
    if(response.status===401) throw new Error("Your session has expired. Please sign in again.");
    throw new Error(data.error||`The marketplace request failed (HTTP ${response.status}). Please try again.`);
  }
  return data as T;
};
const useProducts=()=>{
  const [products,setProducts]=useState<ShopProduct[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [loaded,setLoaded]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");
    fetchMarketplaceGet<{products:ShopProduct[]}>(API_URL+"/api/commerce/products",{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted){setProducts(result.products);setLoaded(true)}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Could not load products.")})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[retry]);
  return {products,loading,error,loaded,retryLoad:()=>setRetry(n=>n+1)};
};
const addToCart=(product:ShopProduct,quantity=1)=>{
  if(product.isDemo)throw new Error("This item is not available for purchase.");
  const cart=getCart();const existing=cart.find(x=>x.productId===product.id);
  const current=existing?.quantity||0;
  if(product.availableUnits<=0)throw new Error("This item is out of stock.");
  if(current+quantity>product.availableUnits || current+quantity>20)throw new Error("Maximum 20 units per product, subject to available stock.");
  const next=existing?cart.map(x=>x.productId===product.id?{...x,quantity:x.quantity+quantity}:x):[...cart,{productId:product.id,quantity}];
  storeCart(next);
};
export function ShopPage(){
  const {products,loading,error,loaded,retryLoad}=useProducts();const [params]=useSearchParams();const [query,setQuery]=useState(()=>params.get("q")||"");const [category,setCategory]=useState(()=>params.get("category")||"All");
  useEffect(()=>{setQuery(params.get("q")||"");setCategory(params.get("category")||"All")},[params]);
  const [providers,setProviders]=useState<ProviderListing[]>([]);
  const [providersError,setProvidersError]=useState("");
  const [cartNotice,setCartNotice]=useState("");
  const [cartError,setCartError]=useState("");
  const addShopProduct=(product:ShopProduct)=>{
    setCartNotice("");setCartError("");
    try{addToCart(product);setCartNotice(`${product.name} added to cart.`)}
    catch(error){setCartError(error instanceof Error?error.message:"Unable to add this item to your cart.")}
  };
  const [providersLoaded,setProvidersLoaded]=useState(false);
  const [providersRetry,setProvidersRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setProvidersError("");
    fetchMarketplaceGet<{listings:ProviderListing[]}>(API_URL+"/api/listings",{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted){setProviders(data.listings.filter(p=>p.moderationStatus!=="rejected"));setProvidersLoaded(true)}})
      .catch(cause=>{if(!controller.signal.aborted)setProvidersError(cause instanceof Error?cause.message:"Unable to load businesses.")});
    return()=>controller.abort();
  },[providersRetry]);
  const categories=["All",...new Set(products.map(x=>x.category))];
  const shown=products.filter(p=>!p.isDemo && (category==="All"||p.category===category)&&(p.name+" "+p.description+" "+p.compatibility).toLowerCase().includes(query.toLowerCase()));
  return <main className="container gura-shop-page"><header className="gura-shop-heading"><div><p className="eyebrow">GURA marketplace</p><h1>Electronic devices & spare parts</h1><p>Browse component details, compare specifications and see listed quantities.</p></div><Link className="gura-shop-cart-link" to="/cart"><ShoppingCart size={20}/> View cart</Link></header>
    <div className="gura-shop-filters"><input aria-label="Search products" placeholder="Find a battery, screen, memory, storage..." value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Product category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
    {loading&&<p>Loading marketplace catalog...</p>}{error&&<div className="gura-shop-error" role="alert">{error} <button type="button" onClick={retryLoad}><RefreshCcw size={15}/> Retry products</button></div>}{cartError&&<p className="gura-shop-error" role="alert">{cartError}</p>}{cartNotice&&<p role="status" className="gura-shop-warning">{cartNotice} <Link to="/cart">View cart</Link></p>}
    <div className="gura-shop-grid">{shown.map(p=><article className="gura-shop-card" key={p.id}><Link to={"/shop/product/"+p.id} className="gura-shop-photo"><img src={p.imageUrl} alt={p.name} loading="lazy"/></Link><div className="gura-shop-card-content"><small>{p.category} · {p.condition}</small><Link to={"/shop/product/"+p.id}><h2>{p.name}</h2></Link><strong>{money(p.priceUgx)}</strong><p>{p.sellerVerified?<span className="verified"><ShieldCheck size={14}/> Verified seller</span>:<span className="gura-unverified"><ShieldCheck size={14}/> Not Yet Verified</span>}</p><p>Available units: {p.availableUnits}</p><div className="gura-marketplace-buy-actions"><button type="button" className="gura-shop-primary" disabled={p.isDemo||p.availableUnits<=0} onClick={()=>addShopProduct(p)}><ShoppingCart size={17}/> {p.isDemo?"Sample only":p.availableUnits>0?"Add to cart":"Out of stock"}</button><Link className="gura-shop-action" to={"/shop/product/"+p.id}>View full details <ArrowRight size={16}/></Link></div></div></article>)}</div>
    {!loading&&loaded&&!error&&!shown.length&&<div className="gura-shop-empty"><Package size={32}/><h2>No stocked products available yet</h2><p>Browse local suppliers and technician listings below to inquire about electronics and spare parts.</p><Link className="gura-shop-primary" to="/directory">Find local suppliers <ArrowRight size={16}/></Link></div>}

    <section className="gura-shop-provider-section" aria-labelledby="gura-provider-heading"><h2 id="gura-provider-heading">Local shops & technicians</h2>
      <p>New provider listings appear here immediately with a Not Yet Verified badge, including their uploaded photos. GURA admin approval changes the badge to Verified.</p>
      {providersError&&<div className="gura-shop-error" role="alert">{providersError} <button type="button" onClick={()=>setProvidersRetry(n=>n+1)}><RefreshCcw size={15}/> Retry businesses</button></div>}{!providersLoaded&&!providersError&&<p>Loading businesses...</p>}
      <div className="gura-shop-providers">{providers.map(provider=><article className="gura-shop-provider" key={provider.id}>
        {provider.images?.[0]?<img src={provider.images[0]} alt={provider.name+" listing photo"} loading="lazy"/>:<div className="gura-shop-provider-placeholder">{provider.type==="technician"?<Wrench size={37}/>:<Store size={37}/>}</div>}
        <div className="gura-shop-provider-info"><span>{provider.moderationStatus==="approved"&&provider.verified?<span className="verified"><ShieldCheck size={14}/> Verified</span>:<span className="gura-unverified"><ShieldCheck size={14}/> Not Yet Verified</span>}</span><h3>{provider.name}</h3><p>{provider.location} · {provider.type==="technician"?"Technician":"Shop / supplier"}</p><p>{provider.text.length>125?provider.text.slice(0,122)+"...":provider.text}</p>
          {(provider.businessPhone || provider.businessWhatsapp || provider.businessEmail) && <div className="gura-marketplace-contacts">{provider.businessPhone&&<a href={"tel:"+provider.businessPhone.replace(/[^\d+]/g,"")}>Call {provider.businessPhone}</a>}{provider.businessWhatsapp&&<a href={"https://wa.me/"+provider.businessWhatsapp.replace(/\D/g,"").replace(/^0/,"256")} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{provider.businessEmail&&<a href={"mailto:"+provider.businessEmail}>Email shop</a>}</div>}<Link to={"/directory?q="+encodeURIComponent(provider.name)}>View listing & details <ArrowRight size={15}/></Link>
        </div></article>)}</div>
    </section>
  </main>;
}
export function ProductPage(){
  const {id}=useParams();const navigate=useNavigate();const [product,setProduct]=useState<ShopProduct|null>(null);const [retryProduct,setRetryProduct]=useState(0);const [activePhoto,setActivePhoto]=useState(0);const [quantity,setQuantity]=useState(1);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!id)return;
    const controller=new AbortController();
    setLoading(true);setError("");
    fetchMarketplaceGet<{product:ShopProduct}>(API_URL+"/api/commerce/products/"+id,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setProduct(result.product)})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Cannot load product.")})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[id,retryProduct]);
  const add=()=>{if(!product)return;setError("");try{addToCart(product,quantity);navigate("/cart")}catch(e){setError(e instanceof Error?e.message:"Cannot add to cart.")}};
  const notPurchasable=!!product&&(product.isDemo||product.availableUnits<=0);
  return <main className="container gura-shop-page"><Link className="gura-shop-back" to="/shop"><ArrowLeft size={16}/> All products</Link>{loading&&<p>Loading product information...</p>}{error&&<div className="gura-shop-error" role="alert">{error} <button type="button" onClick={()=>setRetryProduct(n=>n+1)}><RefreshCcw size={15}/> Retry product</button></div>}
    {product&&<div className="gura-product-layout"><div className="gura-product-gallery"><div className="gura-product-hero-image"><img src={(product.imageUrls?.length?product.imageUrls:[product.imageUrl])[activePhoto]||product.imageUrl} alt={`${product.name} — photo ${activePhoto+1}`}/></div><div className="gura-product-thumbnails">{(product.imageUrls?.length?product.imageUrls:[product.imageUrl]).map((src,index)=><button type="button" className={activePhoto===index?"selected":""} key={index} onClick={()=>setActivePhoto(index)} aria-label={`View product photo ${index+1}`} aria-pressed={activePhoto===index}><img src={src} alt={`Thumbnail ${index+1}`}/></button>)}</div></div><div className="gura-product-information"><span className="gura-shop-category">{product.category} · {product.condition}</span><h1>{product.name}</h1><p>{product.description}</p><strong className="gura-product-price">{money(product.priceUgx)}</strong><p>{product.sellerVerified?<span className="verified"><ShieldCheck size={14}/> Verified supplier</span>:<span className="gura-unverified"><ShieldCheck size={14}/> Not Yet Verified</span>}</p>{product.businessName&&<p>Seller: <b>{product.businessName}</b></p>}{(product.businessPhone||product.businessWhatsapp||product.businessEmail)&&<div className="gura-marketplace-contacts"><strong>Seller contacts</strong>{product.businessPhone&&<a href={"tel:"+product.businessPhone.replace(/[^\d+]/g,"")}>Call {product.businessPhone}</a>}{product.businessWhatsapp&&<a href={"https://wa.me/"+product.businessWhatsapp.replace(/\D/g,"").replace(/^0/,"256")} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{product.businessEmail&&<a href={"mailto:"+product.businessEmail}>Email supplier</a>}</div>}<p className="gura-product-stock">Available stock: <b>{product.availableUnits} units</b></p><p><b>Compatibility:</b> {product.compatibility}</p><h2>Full specifications</h2><dl className="gura-specs">{Object.entries(product.specifications).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}<div><dt>SKU</dt><dd>{product.sku}</dd></div><div><dt>Condition</dt><dd>{product.condition}</dd></div></dl><div className="gura-product-actions"><div className="gura-quantity"><button type="button" disabled={notPurchasable||quantity<=1} onClick={()=>setQuantity(q=>Math.max(1,q-1))} aria-label="Decrease quantity"><Minus size={16}/></button><span>{quantity}</span><button type="button" disabled={notPurchasable||quantity>=Math.min(20,product.availableUnits)} onClick={()=>setQuantity(q=>Math.min(Math.min(20,product.availableUnits),q+1))} aria-label="Increase quantity"><Plus size={16}/></button></div><button className="gura-shop-primary" onClick={add} disabled={notPurchasable}><ShoppingCart size={18}/> {product.isDemo?"Sample only":product.availableUnits>0?"Add to cart":"Out of stock"}</button></div>{notPurchasable&&<p className="gura-shop-warning" role="status">{product.isDemo?"This is a demonstration item and cannot be purchased.":`This item currently has ${product.availableUnits} units recorded in inventory. The seller must update stock before orders can be placed.`} {product.businessPhone&&<a href={"tel:"+product.businessPhone.replace(/[^\d+]/g,"")}>Contact seller</a>}</p>}</div></div>}
  </main>;
}
export function CartPage(){
  const navigate=useNavigate();const {products,loading,error,loaded,retryLoad}=useProducts();const [entries,setEntries]=useState<CartEntry[]>(getCart);
  useEffect(()=>{if(!loading&&loaded&&!error){const valid=entries.filter(e=>products.some(p=>p.id===e.productId&&!p.isDemo));if(valid.length!==entries.length){setEntries(valid);storeCart(valid)}}},[loading,products]);
  const lines=useMemo(()=>entries.map(e=>({entry:e,product:products.find(p=>p.id===e.productId)})).filter((x):x is {entry:CartEntry;product:ShopProduct}=>Boolean(x.product)),[entries,products]);
  const total=lines.reduce((sum,x)=>sum+x.product.priceUgx*x.entry.quantity,0);
  const adjust=(id:string,count:number)=>{const product=products.find(p=>p.id===id);const next=entries.map(x=>x.productId===id?{...x,quantity:Math.min(20,product?.availableUnits||20,Math.max(0,count))}:x).filter(x=>x.quantity>0);setEntries(next);storeCart(next)};
  return <main className="container gura-shop-page"><Link to="/shop" className="gura-shop-back"><ArrowLeft size={16}/> Continue shopping</Link><header className="gura-shop-heading"><h1>Your shopping cart</h1></header>
    {loading&&<p>Loading cart...</p>}{error&&<div role="alert" className="gura-shop-error">{error} <button type="button" onClick={retryLoad}><RefreshCcw size={15}/> Retry cart products</button></div>}
    {!loading&&!entries.length&&<div className="gura-shop-empty"><ShoppingCart size={42}/><h2>Your cart is empty</h2><Link className="gura-shop-primary" to="/shop">Browse products <ArrowRight size={16}/></Link></div>}
    <div className="gura-cart-layout"><div>{lines.map(({entry,product:p})=><div className="gura-cart-line" key={p.id}><Link to={"/shop/product/"+p.id}><img src={p.imageUrl} alt={p.name}/></Link><div><Link to={"/shop/product/"+p.id}><strong>{p.name}</strong></Link><small>Product · {money(p.priceUgx)} each</small><div className="gura-quantity"><button onClick={()=>adjust(p.id,entry.quantity-1)} aria-label="Remove one"><Minus size={15}/></button><span>{entry.quantity}</span><button onClick={()=>adjust(p.id,entry.quantity+1)} disabled={entry.quantity>=Math.min(20,p.availableUnits)} aria-label="Add one"><Plus size={15}/></button></div></div><div className="gura-cart-line-total"><b>{money(p.priceUgx*entry.quantity)}</b><button aria-label={"Remove "+p.name} onClick={()=>adjust(p.id,0)}><X size={16}/></button></div></div>)}</div>
    {!!lines.length&&<aside className="gura-cart-summary"><h2>Order summary</h2><p>Subtotal <b>{money(total)}</b></p><p>Delivery <b>To be confirmed</b></p><div className="gura-cart-total">Total <strong>{money(total)}</strong></div><button className="gura-shop-primary" onClick={()=>navigate("/checkout")} disabled={!!error||loading||!loaded||lines.some(x=>x.entry.quantity>x.product.availableUnits)}>Proceed to checkout <ArrowRight size={17}/></button></aside>}</div>
  </main>;
}
export function CheckoutPage({user}:{user:User|null}){
  const navigate=useNavigate();const {products,loading,error:loadError,retryLoad}=useProducts();const [entries]=useState<CartEntry[]>(getCart);
  const [method,setMethod]=useState<"mtn"|"airtel"|"card">("mtn");const [phone,setPhone]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [sessionChecked,setSessionChecked]=useState(false);const [confirmedUser,setConfirmedUser]=useState<User|null>(null);
  useEffect(()=>{
    let active=true;
    fetch(API_URL+"/api/auth/me",{credentials:"include"}).then(async res=>{
      if(!res.ok) throw new Error("Session verification failed.");
      return await res.json() as {user:User|null};
    }).then(result=>{if(active)setConfirmedUser(result.user)}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Cannot verify your session.")}).finally(()=>{if(active)setSessionChecked(true)});
    return()=>{active=false};
  },[user?.id]);
  const lines=entries.map(e=>({entry:e,product:products.find(p=>p.id===e.productId&&!p.isDemo)})).filter((x):x is {entry:CartEntry;product:ShopProduct}=>Boolean(x.product));
  const total=lines.reduce((sum,x)=>sum+x.product.priceUgx*x.entry.quantity,0);
  const place=async()=>{
    if(!confirmedUser){setError("Your session could not be verified. Please sign in again.");return;}
    setBusy(true);setError("");
    try{
      const result=await request<{order:{id:string;status:string;amountUgx:number};paymentAvailable:boolean}>("/orders",{
        method:"POST",body:JSON.stringify({items:lines.map(x=>({productId:x.product.id,quantity:x.entry.quantity})),paymentMethod:method,...(method!=="card"?{phoneNumber:phone}:{})}),
      });
      storeCart([]);

      if(result.paymentAvailable){
        const pay=await request<{redirectUrl:string}>("/orders/"+result.order.id+"/pay",{method:"POST",body:"{}"});
        window.location.assign(pay.redirectUrl);
        return;
      }
      window.location.assign("/orders?pending=1");
    }catch(e){setError(e instanceof Error?e.message:"Checkout was not completed.");}finally{setBusy(false)}
  };
  return <main className="container gura-shop-page"><Link to="/cart" className="gura-shop-back"><ArrowLeft size={16}/> Back to cart</Link><h1>Secure checkout</h1>{loadError&&<div role="alert" className="gura-shop-error">{loadError} <button type="button" onClick={retryLoad}><RefreshCcw size={15}/> Retry products</button></div>}
    {!sessionChecked&&<div className="gura-shop-warning">Checking your sign-in session...</div>}{sessionChecked&&!confirmedUser&&<div className="gura-shop-warning">Your session is not active. Please <Link to="/login">sign in again</Link> to continue checkout.</div>}

    {lines.some(x=>!x.product.sellerVerified)&&<p className="gura-shop-warning" role="status">Some products are from sellers who are Not Yet Verified by GURA. Please review seller details before purchasing.</p>}<div className="gura-cart-layout"><section className="gura-checkout-options"><h2>Choose payment method</h2><label className={method==="mtn"?"active":""}><input type="radio" name="method" checked={method==="mtn"} onChange={()=>setMethod("mtn")}/> <span><b>MTN MoMo Pay</b><small>Authorize payment on your MTN phone</small></span></label><label className={method==="airtel"?"active":""}><input type="radio" name="method" checked={method==="airtel"} onChange={()=>setMethod("airtel")}/> <span><b>Airtel Money</b><small>Authorize payment on your Airtel phone</small></span></label><label className={method==="card"?"active":""}><input type="radio" name="method" checked={method==="card"} onChange={()=>setMethod("card")}/> <span><b>Debit / credit card</b><small>Enter card details only on the secure payment provider page</small></span></label>{method!=="card"&&<div className="gura-checkout-phone"><label htmlFor="gura-payment-phone">Mobile money number</label><input id="gura-payment-phone" type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07XXXXXXXX" autoComplete="tel"/><small>A PIN request will appear through your mobile money provider when live payments are enabled. Never share your PIN with GURA.</small></div>}<p className="gura-shop-note">Live payments use a hosted gateway. We do not collect mobile-money PINs, card numbers or CVVs.</p></section>
    <aside className="gura-cart-summary"><h2>Checkout summary</h2>{lines.map(x=><p key={x.product.id}>{x.product.name} × {x.entry.quantity}<b>{money(x.product.priceUgx*x.entry.quantity)}</b></p>)}<div className="gura-cart-total">Total <strong>{money(total)}</strong></div>{error&&<p role="alert" className="gura-shop-error">{error}</p>}<button className="gura-shop-primary" disabled={busy||loading||!!loadError||!sessionChecked||!confirmedUser||!lines.length||lines.some(x=>x.entry.quantity>x.product.availableUnits)||(method!=="card"&&!/^(?:\+?256|0)7[0-9]{8}$/.test(phone))} onClick={place}>{busy?"Processing...":"Pay securely"} <ArrowRight size={17}/></button><small>Orders remain unpaid until the gateway confirms payment. Listed availability can change before payment is verified.</small></aside></div>
  </main>;
}
export function OrdersPage({user}:{user:User|null}){
  const [search]=useSearchParams();const [orders,setOrders]=useState<Order[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const load=async()=>{setBusy(true);setError("");try{const r=await request<{orders:Order[]}>("/orders");setOrders(r.orders);}catch(e){setError(e instanceof Error?e.message:"Could not load orders.")}finally{setBusy(false)}};
  useEffect(()=>{if(user)void load()},[user]);
  const verify=async(orderId:string)=>{setBusy(true);try{await request("/orders/"+orderId+"/verify");const r=await request<{orders:Order[]}>("/orders");setOrders(r.orders);}catch(e){setError(e instanceof Error?e.message:"Could not verify payment.")}finally{setBusy(false)}};
  return <main className="container gura-shop-page"><header className="gura-shop-heading"><div><p className="eyebrow">Your GURA account</p><h1>My orders</h1><p>Track checkout and payment confirmation for your GURA orders.</p></div><button className="gura-shop-cart-link" disabled={busy} onClick={()=>void load()}><RefreshCcw size={17}/> Refresh</button></header>

    {search.has("pending")&&<div className="gura-shop-warning">Order recorded as awaiting payment. Payment collection is not yet configured. No funds were charged.</div>}
    {search.has("returned")&&<div className="gura-shop-warning">Returned from the payment provider. Check your order status below; only verified payment will show as paid.</div>}
    {error&&<p className="gura-shop-error" role="alert">{error}</p>}
    {!user?<p><Link to="/login">Sign in</Link> to view your orders.</p>:<div className="gura-order-list">{orders.map(order=><article className="gura-order-card" key={order.id}><div className="gura-order-head"><div><strong>Order #{order.id.slice(0,8).toUpperCase()}</strong><small>{new Date(order.createdAt).toLocaleString("en-UG")}</small></div><span className={"gura-order-status "+order.status}>{order.status.replace("_"," ")}</span></div><div>{order.items.map(item=><p key={item.productId}>{item.quantity} × {item.name}<b>{money(item.priceUgx*item.quantity)}</b></p>)}</div><footer><strong>Total: {money(order.amountUgx)}</strong>{order.status==="pending_payment"&&<button onClick={()=>void verify(order.id)} disabled={busy}><RefreshCcw size={16}/> Verify payment</button>}</footer></article>)}{!orders.length&&!busy&&<div className="gura-shop-empty"><Package size={34}/><h2>No orders yet</h2><Link className="gura-shop-primary" to="/shop">Browse products</Link></div>}</div>}
  </main>;
}

type ManagedProduct=ShopProduct&{active:boolean};
const emptyProduct=()=>({name:"",description:"",category:"",priceUgx:"",availableUnits:"",imageUrls:[] as string[],condition:"New",compatibility:"",active:true});
export function ProviderInventory({user,hasBusiness}:{user:User;hasBusiness:boolean}){
  const [items,setItems]=useState<ManagedProduct[]>([]);
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [form,setForm]=useState(emptyProduct);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=async()=>{
    try{const result=await request<{products:ManagedProduct[]}>("/my-products");setItems(result.products)}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to load your products.")}
  };
  useEffect(()=>{if(hasBusiness&&(user.role==="shop"||user.role==="technician"))void load()},[hasBusiness,user.id,user.role]);
  if(user.role!=="shop"&&user.role!=="technician")return null;
  const begin=(item?:ManagedProduct)=>{
    setEditing(item?.id||null);
    setForm(item?{name:item.name,description:item.description,category:item.category,priceUgx:String(item.priceUgx),availableUnits:String(item.availableUnits),imageUrls:item.imageUrls?.length?item.imageUrls:[item.imageUrl],condition:item.condition,compatibility:item.compatibility,active:item.active}:emptyProduct());
    setError("");setNotice("");setOpen(true);
  };
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      if(!form.imageUrls.length)throw new Error("Add at least one product photo.");
      const payload={name:form.name.trim(),description:form.description.trim(),category:form.category.trim(),
        priceUgx:Number(form.priceUgx),availableUnits:Number(form.availableUnits),imageUrls:form.imageUrls,
        condition:form.condition,compatibility:form.compatibility,active:form.active};
      await request(editing?"/my-products/"+editing:"/my-products",{method:editing?"PATCH":"POST",body:JSON.stringify(payload)});
      await load();setOpen(false);setNotice(editing?"Product updated.":"Product added to your business.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to save product.")}
    finally{setBusy(false)}
  };
  const toggle=async(item:ManagedProduct)=>{
    setBusy(true);setError("");
    try{await request("/my-products/"+item.id,{method:"PATCH",body:JSON.stringify({active:!item.active})});await load()}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to change product status.")}
    finally{setBusy(false)}
  };
  return <section className="panel gura-provider-products">
    <div className="panel-title"><div><p className="eyebrow">Inventory & services</p><h2>Products and items</h2></div>
      {!open&&<button className="button small" disabled={!hasBusiness} onClick={()=>begin()}>Add product</button>}
      {open&&<button className="text-button" onClick={()=>{setOpen(false);setError("")}}>Cancel</button>}</div>
    <p className="muted-text">Add and update as many items as needed within your one business. Each product supports up to three photos, a price and available units. Items from unverified businesses show Not Yet Verified publicly and cannot be paid for until approval.</p>
    {!hasBusiness&&<p className="gura-shop-warning">Create your business profile above before adding products.</p>}
    {notice&&<p className="success" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
    {open&&<form onSubmit={save} className="listing-form gura-item-form">
      <label>Product name<input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Category<input required maxLength={100} placeholder="Screens, RAM, phones, laptops..." value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label>
      <label>Product details<textarea required rows={3} maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label>Price in UGX<input required type="number" min="100" max="1000000000" value={form.priceUgx} onChange={e=>setForm({...form,priceUgx:e.target.value})}/></label>
      <label>Available units<input required type="number" min="0" max="1000000" value={form.availableUnits} onChange={e=>setForm({...form,availableUnits:e.target.value})}/></label>
      <label>Condition<select value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})}><option>New</option><option>Used</option><option>Refurbished</option></select></label>
      <label>Compatibility<input maxLength={300} placeholder="Supported device models" value={form.compatibility} onChange={e=>setForm({...form,compatibility:e.target.value})}/></label>
      <label>Product photographs ({form.imageUrls.length}/3)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||form.imageUrls.length>=3} onChange={async e=>{try{const images=await prepareListingPhotos(e.target.files,3-form.imageUrls.length);setForm(prev=>({...prev,imageUrls:[...prev.imageUrls,...images]}));setError("")}catch(cause){setError(cause instanceof Error?cause.message:"Photos could not be processed.")}e.target.value=""}}/></label>
      <div className="gura-item-photo-previews">{form.imageUrls.map((src,index)=><div className="gura-item-photo-preview" key={index}><img className="gura-item-image-preview" src={src} alt={`Product photo ${index+1}`}/><button type="button" aria-label={`Remove product photo ${index+1}`} onClick={()=>setForm(prev=>({...prev,imageUrls:prev.imageUrls.filter((_,i)=>i!==index)}))}>Remove</button>{index===0&&<small>Main photo</small>}</div>)}</div>
      <label className="gura-item-active"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Listed in marketplace</label>
      <button className="button" disabled={busy}>{busy?"Saving...":editing?"Save product updates":"Publish product"}</button>
    </form>}
    <div className="gura-provider-product-list">{items.map(item=><article className="gura-provider-product-row" key={item.id}>
      <img src={item.imageUrl} alt={item.name}/>
      <div><b>{item.name}</b><small>{money(item.priceUgx)} · {item.availableUnits} unit(s) · {item.active?"Listed":"Hidden"}</small></div>
      <div className="gura-product-manage-actions"><button disabled={busy} onClick={()=>begin(item)}>Edit</button><button disabled={busy} onClick={()=>void toggle(item)}>{item.active?"Hide":"Show"}</button></div>
    </article>)}</div>
    {!items.length&&hasBusiness&&!open&&<p className="muted-text">No items added yet. Add your first product with a photo, price and stock quantity.</p>}
  </section>;
}

export function CartHeaderLink(){const [count,setCount]=useState(()=>getCart().reduce((a,b)=>a+b.quantity,0));useEffect(()=>{const update=()=>setCount(getCart().reduce((a,b)=>a+b.quantity,0));window.addEventListener("gura-cart-updated",update);window.addEventListener("storage",update);return()=>{window.removeEventListener("gura-cart-updated",update);window.removeEventListener("storage",update)}},[]);return <Link to="/cart" className="gura-cart-nav" aria-label={"Shopping cart, "+count+" items"}><ShoppingCart size={18}/><span>{count}</span></Link>}
