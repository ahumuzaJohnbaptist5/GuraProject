import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Minus, Plus, ShoppingCart, Package, ShieldCheck, Store, Wrench, X, RefreshCcw } from "lucide-react";
import type { User } from "./types";

export type ShopProduct = {
  id:string; sku:string; name:string; description:string; category:string; priceUgx:number; availableUnits:number;
  imageUrl:string; condition:string; compatibility:string; specifications:Record<string,string>; isDemo:boolean;
};
type ProviderListing={id:string;name:string;type:"shop"|"technician"|"seller";location:string;text:string;images?:string[];verified:boolean;moderationStatus:"pending"|"approved"|"rejected"};
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
  if(!response.ok) throw new Error(data.error||"We couldn't complete your request. Please try again.");
  return data as T;
};
const useProducts=()=>{
  const [products,setProducts]=useState<ShopProduct[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;request<{products:ShopProduct[]}>("/products").then(r=>{if(active)setProducts(r.products)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  return {products,loading,error};
};
const addToCart=(product:ShopProduct,quantity=1)=>{
  if(product.isDemo)throw new Error("This sample product is not available for purchase.");
  const cart=getCart();const existing=cart.find(x=>x.productId===product.id);
  const current=existing?.quantity||0;
  if(product.availableUnits<=0)throw new Error("This item is out of stock.");
  if(current+quantity>product.availableUnits || current+quantity>20)throw new Error("Maximum 20 units per product, subject to available stock.");
  const next=existing?cart.map(x=>x.productId===product.id?{...x,quantity:x.quantity+quantity}:x):[...cart,{productId:product.id,quantity}];
  storeCart(next);
};
export function ShopPage(){
  const {products,loading,error}=useProducts();const [query,setQuery]=useState("");const [category,setCategory]=useState("All");
  const [providers,setProviders]=useState<ProviderListing[]>([]);
  const [providersError,setProvidersError]=useState("");
  useEffect(()=>{
    let active=true;
    fetch(API_URL+"/api/listings",{credentials:"include"}).then(async response=>{
      if(!response.ok)throw new Error("Unable to load local business listings.");
      return await response.json() as {listings:ProviderListing[]};
    }).then(data=>{if(active)setProviders(data.listings.filter(p=>p.moderationStatus!=="rejected"))})
      .catch(error=>{if(active)setProvidersError(error instanceof Error?error.message:"Unable to load businesses.")});
    return()=>{active=false};
  },[]);
  const categories=["All",...new Set(products.map(x=>x.category))];
  const shown=products.filter(p=>!p.isDemo && (category==="All"||p.category===category)&&(p.name+" "+p.description+" "+p.compatibility).toLowerCase().includes(query.toLowerCase()));
  return <main className="container gura-shop-page"><header className="gura-shop-heading"><div><p className="eyebrow">GURA marketplace</p><h1>Electronic devices & spare parts</h1><p>Browse component details, compare specifications and see listed quantities.</p></div><Link className="gura-shop-cart-link" to="/cart"><ShoppingCart size={20}/> View cart</Link></header>
    <div className="gura-shop-filters"><input aria-label="Search products" placeholder="Find a battery, screen, memory, storage..." value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Product category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
    {loading&&<p>Loading marketplace catalog...</p>}{error&&<p className="gura-shop-error" role="alert">{error}</p>}
    <div className="gura-shop-grid">{shown.map(p=><article className="gura-shop-card" key={p.id}><Link to={"/shop/product/"+p.id} className="gura-shop-photo"><img src={p.imageUrl} alt={p.name} loading="lazy"/></Link><div className="gura-shop-card-content"><small>{p.category} · {p.condition}</small><Link to={"/shop/product/"+p.id}><h2>{p.name}</h2></Link><strong>{money(p.priceUgx)}</strong><p>Available units: {p.availableUnits}</p><Link className="gura-shop-action" to={"/shop/product/"+p.id}>View full details <ArrowRight size={16}/></Link></div></article>)}</div>
    {!loading&&!error&&!shown.length&&<div className="gura-shop-empty"><Package size={32}/><h2>No stocked products available yet</h2><p>Browse local suppliers and technician listings below to inquire about electronics and spare parts.</p><Link className="gura-shop-primary" to="/directory">Find local suppliers <ArrowRight size={16}/></Link></div>}

    <section className="gura-shop-provider-section" aria-labelledby="gura-provider-heading"><h2 id="gura-provider-heading">Local shops & technicians</h2>
      <p>New provider listings appear here immediately with a Not Yet Verified badge, including their uploaded photos. GURA admin approval changes the badge to Verified.</p>
      {providersError&&<p className="gura-shop-error" role="alert">{providersError}</p>}
      <div className="gura-shop-providers">{providers.map(provider=><article className="gura-shop-provider" key={provider.id}>
        {provider.images?.[0]?<img src={provider.images[0]} alt={provider.name+" listing photo"} loading="lazy"/>:<div className="gura-shop-provider-placeholder">{provider.type==="technician"?<Wrench size={37}/>:<Store size={37}/>}</div>}
        <div className="gura-shop-provider-info"><span>{provider.moderationStatus==="approved"&&provider.verified?<span className="verified"><ShieldCheck size={14}/> Verified</span>:<span className="gura-unverified"><ShieldCheck size={14}/> Not Yet Verified</span>}</span><h3>{provider.name}</h3><p>{provider.location} · {provider.type==="technician"?"Technician":"Shop / supplier"}</p><p>{provider.text.length>125?provider.text.slice(0,122)+"...":provider.text}</p>
          <Link to={"/directory?q="+encodeURIComponent(provider.name)}>View listing & details <ArrowRight size={15}/></Link>
        </div></article>)}</div>
    </section>
  </main>;
}
export function ProductPage(){
  const {id}=useParams();const navigate=useNavigate();const [product,setProduct]=useState<ShopProduct|null>(null);const [quantity,setQuantity]=useState(1);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{if(!id)return;let active=true;request<{product:ShopProduct}>("/products/"+id).then(r=>{if(active)setProduct(r.product)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id]);
  const add=()=>{if(!product)return;try{addToCart(product,quantity);navigate("/cart")}catch(e){setError(e instanceof Error?e.message:"Cannot add to cart.")}};
  return <main className="container gura-shop-page"><Link className="gura-shop-back" to="/shop"><ArrowLeft size={16}/> All products</Link>{loading&&<p>Loading product information...</p>}{error&&<p className="gura-shop-error" role="alert">{error}</p>}
    {product&&<div className="gura-product-layout"><div className="gura-product-hero-image"><img src={product.imageUrl} alt={product.name}/></div><div className="gura-product-information"><span className="gura-shop-category">{product.category} · {product.condition}</span><h1>{product.name}</h1><p>{product.description}</p><strong className="gura-product-price">{money(product.priceUgx)}</strong><p className="gura-product-stock">Available stock: <b>{product.availableUnits} units</b></p><p><b>Compatibility:</b> {product.compatibility}</p><h2>Full specifications</h2><dl className="gura-specs">{Object.entries(product.specifications).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}<div><dt>SKU</dt><dd>{product.sku}</dd></div><div><dt>Condition</dt><dd>{product.condition}</dd></div></dl><div className="gura-product-actions"><div className="gura-quantity"><button type="button" onClick={()=>setQuantity(q=>Math.max(1,q-1))} aria-label="Decrease quantity"><Minus size={16}/></button><span>{quantity}</span><button type="button" onClick={()=>setQuantity(q=>Math.min(Math.min(20,product.availableUnits),q+1))} aria-label="Increase quantity"><Plus size={16}/></button></div><button className="gura-shop-primary" onClick={add} disabled={product.availableUnits===0}><ShoppingCart size={18}/> Add to cart</button></div></div></div>}
  </main>;
}
export function CartPage(){
  const navigate=useNavigate();const {products,loading,error}=useProducts();const [entries,setEntries]=useState<CartEntry[]>(getCart);
  useEffect(()=>{if(!loading){const valid=entries.filter(e=>products.some(p=>p.id===e.productId&&!p.isDemo));if(valid.length!==entries.length){setEntries(valid);storeCart(valid)}}},[loading,products]);
  const lines=useMemo(()=>entries.map(e=>({entry:e,product:products.find(p=>p.id===e.productId)})).filter((x):x is {entry:CartEntry;product:ShopProduct}=>Boolean(x.product)),[entries,products]);
  const total=lines.reduce((sum,x)=>sum+x.product.priceUgx*x.entry.quantity,0);
  const adjust=(id:string,count:number)=>{const product=products.find(p=>p.id===id);const next=entries.map(x=>x.productId===id?{...x,quantity:Math.min(20,product?.availableUnits||20,Math.max(0,count))}:x).filter(x=>x.quantity>0);setEntries(next);storeCart(next)};
  return <main className="container gura-shop-page"><Link to="/shop" className="gura-shop-back"><ArrowLeft size={16}/> Continue shopping</Link><header className="gura-shop-heading"><h1>Your shopping cart</h1></header>
    {loading&&<p>Loading cart...</p>}{error&&<p role="alert" className="gura-shop-error">{error}</p>}
    {!loading&&!entries.length&&<div className="gura-shop-empty"><ShoppingCart size={42}/><h2>Your cart is empty</h2><Link className="gura-shop-primary" to="/shop">Browse products <ArrowRight size={16}/></Link></div>}
    <div className="gura-cart-layout"><div>{lines.map(({entry,product:p})=><div className="gura-cart-line" key={p.id}><Link to={"/shop/product/"+p.id}><img src={p.imageUrl} alt={p.name}/></Link><div><Link to={"/shop/product/"+p.id}><strong>{p.name}</strong></Link><small>Product · {money(p.priceUgx)} each</small><div className="gura-quantity"><button onClick={()=>adjust(p.id,entry.quantity-1)} aria-label="Remove one"><Minus size={15}/></button><span>{entry.quantity}</span><button onClick={()=>adjust(p.id,entry.quantity+1)} disabled={entry.quantity>=Math.min(20,p.availableUnits)} aria-label="Add one"><Plus size={15}/></button></div></div><div className="gura-cart-line-total"><b>{money(p.priceUgx*entry.quantity)}</b><button aria-label={"Remove "+p.name} onClick={()=>adjust(p.id,0)}><X size={16}/></button></div></div>)}</div>
    {!!lines.length&&<aside className="gura-cart-summary"><h2>Order summary</h2><p>Subtotal <b>{money(total)}</b></p><p>Delivery <b>To be confirmed</b></p><div className="gura-cart-total">Total <strong>{money(total)}</strong></div><button className="gura-shop-primary" onClick={()=>navigate("/checkout")} disabled={lines.some(x=>x.entry.quantity>x.product.availableUnits)}>Proceed to checkout <ArrowRight size={17}/></button></aside>}</div>
  </main>;
}
export function CheckoutPage({user}:{user:User|null}){
  const navigate=useNavigate();const {products,loading,error:loadError}=useProducts();const [entries]=useState<CartEntry[]>(getCart);
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
  return <main className="container gura-shop-page"><Link to="/cart" className="gura-shop-back"><ArrowLeft size={16}/> Back to cart</Link><h1>Secure checkout</h1>{loadError&&<p role="alert" className="gura-shop-error">{loadError}</p>}
    {!sessionChecked&&<div className="gura-shop-warning">Checking your sign-in session...</div>}{sessionChecked&&!confirmedUser&&<div className="gura-shop-warning">Your session is not active. Please <Link to="/login">sign in again</Link> to continue checkout.</div>}{sessionChecked&&confirmedUser&&confirmedUser.role!=="customer"&&<div className="gura-shop-warning">You are signed in as a {confirmedUser.role}. Checkout currently requires a customer account.</div>}

    <div className="gura-cart-layout"><section className="gura-checkout-options"><h2>Choose payment method</h2><label className={method==="mtn"?"active":""}><input type="radio" name="method" checked={method==="mtn"} onChange={()=>setMethod("mtn")}/> <span><b>MTN MoMo Pay</b><small>Authorize payment on your MTN phone</small></span></label><label className={method==="airtel"?"active":""}><input type="radio" name="method" checked={method==="airtel"} onChange={()=>setMethod("airtel")}/> <span><b>Airtel Money</b><small>Authorize payment on your Airtel phone</small></span></label><label className={method==="card"?"active":""}><input type="radio" name="method" checked={method==="card"} onChange={()=>setMethod("card")}/> <span><b>Debit / credit card</b><small>Enter card details only on the secure payment provider page</small></span></label>{method!=="card"&&<div className="gura-checkout-phone"><label htmlFor="gura-payment-phone">Mobile money number</label><input id="gura-payment-phone" type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07XXXXXXXX" autoComplete="tel"/><small>A PIN request will appear through your mobile money provider when live payments are enabled. Never share your PIN with GURA.</small></div>}<p className="gura-shop-note">Live payments use a hosted gateway. We do not collect mobile-money PINs, card numbers or CVVs.</p></section>
    <aside className="gura-cart-summary"><h2>Checkout summary</h2>{lines.map(x=><p key={x.product.id}>{x.product.name} × {x.entry.quantity}<b>{money(x.product.priceUgx*x.entry.quantity)}</b></p>)}<div className="gura-cart-total">Total <strong>{money(total)}</strong></div>{error&&<p role="alert" className="gura-shop-error">{error}</p>}<button className="gura-shop-primary" disabled={busy||loading||!sessionChecked||!confirmedUser||confirmedUser.role!=="customer"||!lines.length||lines.some(x=>x.entry.quantity>x.product.availableUnits)||(method!=="card"&&!/^(?:\+?256|0)7[0-9]{8}$/.test(phone))} onClick={place}>{busy?"Processing...":"Pay securely"} <ArrowRight size={17}/></button><small>Orders remain unpaid until the gateway confirms payment. Listed availability can change before payment is verified.</small></aside></div>
  </main>;
}
export function OrdersPage({user}:{user:User|null}){
  const [search]=useSearchParams();const [orders,setOrders]=useState<Order[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const load=async()=>{setBusy(true);setError("");try{const r=await request<{orders:Order[]}>("/orders");setOrders(r.orders);}catch(e){setError(e instanceof Error?e.message:"Could not load orders.")}finally{setBusy(false)}};
  useEffect(()=>{if(user)void load()},[user]);
  const verify=async(orderId:string)=>{setBusy(true);try{await request("/orders/"+orderId+"/verify");const r=await request<{orders:Order[]}>("/orders");setOrders(r.orders);}catch(e){setError(e instanceof Error?e.message:"Could not verify payment.")}finally{setBusy(false)}};
  return <main className="container gura-shop-page"><header className="gura-shop-heading"><div><p className="eyebrow">Customer account</p><h1>My orders</h1><p>Track checkout and payment confirmation for your GURA orders.</p></div><button className="gura-shop-cart-link" disabled={busy} onClick={()=>void load()}><RefreshCcw size={17}/> Refresh</button></header>

    {search.has("pending")&&<div className="gura-shop-warning">Order recorded as awaiting payment. Payment collection is not yet configured. No funds were charged.</div>}
    {search.has("returned")&&<div className="gura-shop-warning">Returned from the payment provider. Check your order status below; only verified payment will show as paid.</div>}
    {error&&<p className="gura-shop-error" role="alert">{error}</p>}
    {!user?<p><Link to="/login">Sign in</Link> to view your orders.</p>:<div className="gura-order-list">{orders.map(order=><article className="gura-order-card" key={order.id}><div className="gura-order-head"><div><strong>Order #{order.id.slice(0,8).toUpperCase()}</strong><small>{new Date(order.createdAt).toLocaleString("en-UG")}</small></div><span className={"gura-order-status "+order.status}>{order.status.replace("_"," ")}</span></div><div>{order.items.map(item=><p key={item.productId}>{item.quantity} × {item.name}<b>{money(item.priceUgx*item.quantity)}</b></p>)}</div><footer><strong>Total: {money(order.amountUgx)}</strong>{order.status==="pending_payment"&&<button onClick={()=>void verify(order.id)} disabled={busy}><RefreshCcw size={16}/> Verify payment</button>}</footer></article>)}{!orders.length&&!busy&&<div className="gura-shop-empty"><Package size={34}/><h2>No orders yet</h2><Link className="gura-shop-primary" to="/shop">Browse products</Link></div>}</div>}
  </main>;
}
export function CartHeaderLink(){const [count,setCount]=useState(()=>getCart().reduce((a,b)=>a+b.quantity,0));useEffect(()=>{const update=()=>setCount(getCart().reduce((a,b)=>a+b.quantity,0));window.addEventListener("gura-cart-updated",update);window.addEventListener("storage",update);return()=>{window.removeEventListener("gura-cart-updated",update);window.removeEventListener("storage",update)}},[]);return <Link to="/cart" className="gura-cart-nav" aria-label={"Shopping cart, "+count+" items"}><ShoppingCart size={18}/><span>{count}</span></Link>}
