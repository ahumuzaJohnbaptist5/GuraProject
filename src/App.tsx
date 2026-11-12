import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ClipboardList, Download, Heart, Image as ImageIcon, LogOut, Menu, MessageCircle, RotateCcw, Search, ShieldCheck, Star, Store, Trash2, Upload, Wrench, X, MapPin, HardDrive, Cpu, Monitor, Plug, Eye, EyeOff, LockKeyhole, LoaderCircle } from "lucide-react";
import auth, { refreshSession } from "./auth";
import { prepareListingPhotos } from "./listingPhotos";
import { CartHeaderLink, CartPage, CheckoutPage, OrdersPage, ProductPage, ShopPage, ProviderInventory } from "./Shop";
import { confirmRequestDate, createAuditEvent, createListing, createMessage, createReport, createRequest, createReview, domainAdapter, exportDomainData, getListingRating, hydrateDomain, listAuditEvents, listFavorites, listListings, listMessages, listNotifications, listReports, listRequests, listReviews, markNotificationsRead, resetDomainData, toggleFavorite, updateListing, updateListingStatus, updateReportStatus, updateRequest } from "./data";
import type { Listing, ListingType, Role, ServiceRequest, User } from "./types";

const roleLabels: Record<Role, string> = { customer: "Customer", technician: "Technician", shop: "Shop", administrator: "Administrator" };
const listingLabels: Record<ListingType, string> = { technician: "Technician", shop: "Electronics shop", seller: "Second-hand seller" };

function Header({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const unread = user ? listNotifications(user.id).filter((item) => !item.read).length : 0;
  return <header className="site-header"><Link className="brand" to="/" aria-label="Gura home"><img src="/gura-logo.png" alt="Gura Computer Parts Marketplace" /></Link><CartHeaderLink/><button className="menu-button" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button><nav className={open ? "nav open" : "nav"}><Link to="/shop" onClick={() => setOpen(false)}>Products</Link><Link to="/directory" onClick={() => setOpen(false)}>Marketplace</Link><Link to="/directory?type=shop" onClick={() => setOpen(false)}>Suppliers</Link>{user ? <><Link to="/orders" onClick={() => setOpen(false)}>My Orders</Link><Link to="/dashboard" onClick={() => setOpen(false)}>Dashboard{unread > 0 && <span className="notification-badge">{unread}</span>}</Link><Link to="/profile" onClick={() => setOpen(false)}>My Profile</Link><button className="nav-logout" onClick={onLogout}><LogOut size={16} /> Sign out</button></> : <><Link to="/login" onClick={() => setOpen(false)}>Sign in</Link><Link className="button small" to="/register" onClick={() => setOpen(false)}>Get started</Link></>}</nav></header>;
}
function Layout({ children, user, onLogout }: { children: React.ReactNode; user: User | null; onLogout: () => void }) {
  return <div className="app-shell">
    <Header user={user} onLogout={onLogout}/>{children}
    <footer className="gura-site-footer">
      <div className="gura-footer-main">
        <div className="gura-footer-brand"><Link to="/" aria-label="GURA APP home"><img src="/gura-logo.png" alt="GURA APP"/></Link><p>Connecting technicians, repair shops and suppliers across the region.</p></div>
        <nav className="gura-footer-links" aria-label="Footer quick links">
          <h2>Quick Links</h2>
          <Link to="/">Home</Link>
          <Link to="/shop">Shop Products</Link><Link to="/directory">Marketplace</Link>
          <Link to="/directory?type=shop">Suppliers</Link>
          
        </nav>
        <nav className="gura-footer-links" aria-label="Footer account links">
          <h2>Your Account</h2>
          {user ? <><Link to="/dashboard">Dashboard</Link><Link to="/profile">My Profile</Link></> : <><Link to="/login">Sign In</Link><Link to="/register">Get Started</Link></>}
          <Link to="/orders">My Orders</Link><Link to="/directory">Browse Local Businesses</Link>
        </nav>
      </div>
      <div className="gura-footer-bottom"><span>© {new Date().getFullYear()} GURA APP. All rights reserved.</span><span>Regional Computer Parts Network</span></div>
    </footer>
  </div>;
}
type HomeProduct = {
  id:string; name:string; description:string; category:string; priceUgx:number; availableUnits:number;
  imageUrl:string; imageUrls?:string[]; condition:string; isDemo:boolean; sellerVerified:boolean; businessName?:string;
};
type HomeBusiness = {
  id:string; name:string; type:string; location:string; images?:string[];
  verified:boolean; moderationStatus:string; text:string;
};
function FreshHome() {
  const navigate = useNavigate();
  const [part,setPart]=useState("");
  const [products,setProducts]=useState<HomeProduct[]>([]);
  const [businesses,setBusinesses]=useState<HomeBusiness[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const results=await Promise.allSettled([
        fetch("/api/commerce/products",{credentials:"include",cache:"no-store"}).then(async res=>{if(!res.ok)throw new Error("Products are temporarily unavailable.");return await res.json() as {products:HomeProduct[]}}),
        fetch("/api/listings",{credentials:"include",cache:"no-store"}).then(async res=>{if(!res.ok)throw new Error("Business listings are temporarily unavailable.");return await res.json() as {listings:HomeBusiness[]}}),
      ]);
      if(!active)return;
      if(results[0].status==="fulfilled")setProducts(results[0].value.products.filter(item=>!item.isDemo));
      if(results[1].status==="fulfilled")setBusinesses(results[1].value.listings.filter(item=>item.moderationStatus!=="rejected"));
      if(results[0].status==="rejected"&&results[1].status==="rejected")setError("The marketplace is temporarily unavailable. Please try again.");
      else if(results[0].status==="rejected")setError("Products are temporarily unavailable; business listings can still be browsed.");
      else if(results[1].status==="rejected")setError("Business profiles are temporarily unavailable; products can still be browsed.");
      setLoading(false);
    };
    void load();
    return()=>{active=false};
  },[]);
  const categories=Array.from(new Map(products.map(p=>[p.category,p])).entries()).map(([name,product])=>({name,photo:product.imageUrl,count:products.filter(p=>p.category===name).length}));
  const featured=products.slice(0,8);
  const suppliers=businesses.slice(0,4);
  const money=(value:number)=>"UGX "+value.toLocaleString("en-UG");
  const search=(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    navigate("/shop"+(part.trim()?"?q="+encodeURIComponent(part.trim()):""));
  };
  return <main className="gura-tech-home gura-live-home">
    <section className="gura-tech-hero" aria-labelledby="gura-tech-heading">
      <div className="container gura-tech-hero-inner">
        <div className="gura-tech-hero-content">
          <span className="gura-tech-kicker">GURA ELECTRONICS MARKETPLACE</span>
          <h1 id="gura-tech-heading">FIND THE<br/>MISSING <em>PIECE.</em><br/>FINISH THE JOB.</h1>
          <p className="gura-tech-intro">Browse real products and business listings uploaded by shops and technicians. See prices, available units, photos and seller verification status.</p>
          <form className="gura-tech-search" role="search" onSubmit={search}>
            <label className="gura-tech-search-field"><Search size={21} aria-hidden="true"/><span className="sr-only">Search marketplace products</span><input value={part} onChange={event=>setPart(event.target.value)} placeholder="Search products, parts, accessories..." aria-label="Search marketplace products"/></label>
            <button className="gura-tech-search-submit" type="submit">SEARCH PRODUCTS <ArrowRight size={20}/></button>
          </form>
          <p className="gura-tech-search-note">Items and quantities are provided by registered GURA businesses. A Not Yet Verified badge means the business has not been approved by GURA.</p>
        </div>
        <div className="gura-live-hero-aside" aria-label="Marketplace availability">
          <span className="gura-tech-aside-overline">FROM THE MARKETPLACE</span>
          {loading?<p>Loading real listings...</p>:featured[0]?<>
            <Link className="gura-live-hero-image" to={"/shop/product/"+featured[0].id}><img src={featured[0].imageUrl} alt={featured[0].name}/></Link>
            <h2>{featured[0].name}</h2>
            <strong>{money(featured[0].priceUgx)}</strong>
            <p>{featured[0].sellerVerified?"Verified seller":"Not Yet Verified"} · {featured[0].availableUnits} available</p>
            <Link className="gura-live-item-link" to={"/shop/product/"+featured[0].id}>View product details <ArrowRight size={16}/></Link>
          </>:suppliers[0]?<>
            {suppliers[0].images?.[0]&&<img className="gura-live-hero-image-static" src={suppliers[0].images[0]} alt={suppliers[0].name}/>}
            <h2>{suppliers[0].name}</h2><p>{suppliers[0].location} · {suppliers[0].verified?"Verified":"Not Yet Verified"}</p>
            <Link className="gura-live-item-link" to={"/directory?q="+encodeURIComponent(suppliers[0].name)}>View business <ArrowRight size={16}/></Link>
          </>:<><h2>Discover local electronics businesses</h2><p>New supplier products will appear here as they are published.</p><Link className="gura-live-item-link" to="/directory">Browse businesses <ArrowRight size={16}/></Link></>}
        </div>
      </div>
      {!loading&&<div className="container gura-live-counts" aria-label="Live marketplace overview">
        <span><strong>{products.length}</strong> listed products</span>
        <span><strong>{businesses.length}</strong> listed businesses</span>
        <span><strong>{businesses.filter(b=>b.verified&&b.moderationStatus==="approved").length}</strong> verified businesses</span>
      </div>}
    </section>
    <section className="gura-tech-content">
      {error&&<div className="container"><p className="gura-live-error" role="alert">{error}</p></div>}
      <div className="container gura-tech-section">
        <div className="gura-tech-section-heading"><div><span className="gura-tech-overline">PRODUCTS FROM GURA SELLERS</span><h2>Latest products</h2><p>Photos, prices and stock are taken directly from provider listings.</p></div><Link to="/shop">All products <ArrowRight size={17}/></Link></div>
        {loading?<p className="gura-live-loading">Loading products...</p>:featured.length?<div className="gura-live-product-grid">
          {featured.map(product=><article className="gura-live-product" key={product.id}>
            <Link className="gura-live-product-photo" to={"/shop/product/"+product.id}><img loading="lazy" src={product.imageUrl} alt={product.name}/></Link>
            <div className="gura-live-product-body">
              <small>{product.category} · {product.condition}</small>
              <Link to={"/shop/product/"+product.id}><h3>{product.name}</h3></Link>
              <strong>{money(product.priceUgx)}</strong>
              <span className={product.sellerVerified?"gura-live-verified":"gura-live-unverified"}>{product.sellerVerified?<ShieldCheck size={14}/>:null}{product.sellerVerified?"Verified seller":"Not Yet Verified"}</span>
              <p>{product.availableUnits} available{product.businessName?" · "+product.businessName:""}</p>
              <Link className="gura-live-view" to={"/shop/product/"+product.id}>View details <ArrowRight size={15}/></Link>
            </div>
          </article>)}
        </div>:<div className="gura-live-empty"><Store size={30}/><h3>No products have been published yet</h3><p>New products uploaded by real shops and technicians will appear here automatically.</p><Link to="/directory">Browse business listings <ArrowRight size={15}/></Link></div>}
      </div>
      {!!categories.length&&<section className="container gura-tech-section gura-live-category-section">
        <div className="gura-tech-section-heading"><div><span className="gura-tech-overline">BASED ON LISTED INVENTORY</span><h2>Shop by category</h2></div></div>
        <div className="gura-live-categories">{categories.map(category=><Link to={"/shop?category="+encodeURIComponent(category.name)} key={category.name} className="gura-live-category">
          <img src={category.photo} alt=""/><span><strong>{category.name}</strong><small>{category.count} {category.count===1?"product":"products"}</small></span><ArrowRight size={16}/>
        </Link>)}</div>
      </section>}
      <section className="container gura-tech-section gura-live-providers">
        <div className="gura-tech-section-heading"><div><span className="gura-tech-overline">REAL REGISTERED BUSINESSES</span><h2>Shops and technicians</h2><p>View business-uploaded photos, locations and verification status.</p></div><Link to="/directory">All businesses <ArrowRight size={17}/></Link></div>
        {loading?<p className="gura-live-loading">Loading businesses...</p>:suppliers.length?<div className="gura-live-business-grid">{suppliers.map(b=><article className="gura-live-business" key={b.id}>
          {b.images?.[0]?<img src={b.images[0]} alt={b.name} loading="lazy"/>:<div className="gura-live-business-placeholder"><Store size={31}/></div>}
          <div><span className={b.verified&&b.moderationStatus==="approved"?"gura-live-verified":"gura-live-unverified"}>{b.verified&&b.moderationStatus==="approved"?"Verified":"Not Yet Verified"}</span><h3>{b.name}</h3><p>{b.location} · {b.type==="technician"?"Technician":"Shop"}</p><Link to={"/directory?q="+encodeURIComponent(b.name)}>View business <ArrowRight size={15}/></Link></div>
        </article>)}</div>:<p className="gura-live-loading">Business profiles will appear here when providers publish them.</p>}
      </section>
    </section>
  </main>;
}
function FreshFeature({ icon, number, title, text }: { icon: React.ReactNode; number: string; title: string; text: string }) {
  return <article className="fresh-feature"><div className="fresh-feature-top"><span className="fresh-feature-icon">{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>;
}
function Home() { return <main><section className="hero container"><div className="hero-copy"><p className="eyebrow">Repair. Discover. Trade.</p><h1>Good tech help is closer than you think.</h1><p className="lede">Gura connects you with verified technicians, electronics shops, and trusted second-hand sellers in one friendly place.</p><div className="hero-actions"><Link className="button" to="/register">Join Gura <ArrowRight size={18} /></Link><Link className="text-link" to="/directory">Browse the directory</Link></div><div className="trust-row"><span><CheckCircle2 size={17} /> Identity-first profiles</span><span><CheckCircle2 size={17} /> Clear, local listings</span></div></div><div className="hero-card"><div className="sparkle">✦</div><p className="eyebrow">A better way to get unstuck</p><h2>From a cracked screen to your next laptop.</h2><div className="mini-list"><div><Wrench size={20} /><span><b>Find a specialist</b><small>Verified people who know their craft</small></span></div><div><Store size={20} /><span><b>Shop with confidence</b><small>Discover useful tech nearby</small></span></div></div></div></section><section className="section muted"><div className="container"><p className="eyebrow">How Gura works</p><h2 className="section-title">A simpler starting point.</h2><div className="feature-grid"><Feature icon={<Search />} title="Explore" text="Search a growing directory of local electronics experts and sellers." /><Feature icon={<ShieldCheck />} title="Trust" text="See verification, services, and reputation signals before you reach out." /><Feature icon={<ClipboardList />} title="Connect" text="Send a service request and continue the conversation in one place." /></div></div></section></main>; }
function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="feature"><div className="icon-box">{icon}</div><h3>{title}</h3><p>{text}</p></article>; }

function Directory({ user }: { user: User | null }) {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") || ""); const [location, setLocation] = useState(() => searchParams.get("location") || ""); const [filter, setFilter] = useState<"all" | ListingType>(() => (["technician","shop","seller"].includes(searchParams.get("type") || "") ? searchParams.get("type") as ListingType : "all")); const [sort, setSort] = useState<"relevance" | "rating">("relevance"); const [favoritesOnly, setFavoritesOnly] = useState(false); const [selected, setSelected] = useState<Listing | null>(null); const [sent, setSent] = useState(false); const [reported, setReported] = useState(false); const [favorites, setFavorites] = useState<string[]>(user ? listFavorites(user.id) : []);
  const listings = useMemo(() => listListings().filter((listing) => (listing.moderationStatus || "approved") !== "rejected" && (!favoritesOnly || favorites.includes(listing.id)) && (filter === "all" || listing.type === filter) && (!location || listing.location.toLowerCase().includes(location.toLowerCase())) && `${listing.name} ${listing.location} ${listing.text} ${listing.services.join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "rating" ? getListingRating(b) - getListingRating(a) : 0), [query, location, filter, sort, favoritesOnly, favorites]);
  const sendRequest = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!user || !selected) return; const data = new FormData(event.currentTarget); createRequest({ id: crypto.randomUUID(), customerId: user.id, listingId: selected.id, providerId: selected.ownerId, title: String(data.get("title")), details: String(data.get("details")), preferredDate: String(data.get("preferredDate") || ""), preferredTime: String(data.get("preferredTime") || ""), status: "open", createdAt: new Date().toISOString() }); setSelected(null); setSent(true); setTimeout(() => setSent(false), 3000); };
  const favorite = (listingId: string) => { if (!user) return; setFavorites(toggleFavorite(user.id, listingId)); };
  const claimListing = (listing: Listing) => { if (!user || (user.role !== "technician" && user.role !== "shop") || listing.ownerId) return; const expectedType: ListingType = user.role === "shop" ? "shop" : "technician"; if (listing.type !== expectedType) return; updateListing(listing.id, { ownerId: user.id }); setSelected({ ...listing, ownerId: user.id }); };
  const report = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!user || !selected) return; const data = new FormData(event.currentTarget); createReport({ id: crypto.randomUUID(), listingId: selected.id, reporterId: user.id, reason: String(data.get("reason")), details: String(data.get("details")), status: "open", createdAt: new Date().toISOString() }); setReported(true); };
  const selectedReviews = selected ? listReviews().filter((review) => review.listingId === selected.id) : [];
  return <main className="container page"><p className="eyebrow">GURA network</p><h1>Find local technicians and suppliers.</h1><p className="lede narrow">Discover local business profiles and check their verification status before making an inquiry.</p><div className="directory-tools"><label className="search-field"><Search size={18} /><input aria-label="Search listings" placeholder="Search by name, service, or location" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select aria-label="Filter listing type" value={filter} onChange={(e) => setFilter(e.target.value as "all" | ListingType)}><option value="all">All provider types</option><option value="technician">Technicians</option><option value="shop">Shops</option><option value="seller">Second-hand sellers</option></select><select aria-label="Filter location" value={location} onChange={(e) => setLocation(e.target.value)}><option value="">All locations</option><option value="Kabale">Kabale</option><option value="Mbarara">Mbarara</option><option value="Kampala">Kampala</option><option value="Fort Portal">Fort Portal</option><option value="Ntungamo">Ntungamo</option></select><select aria-label="Sort listings" value={sort} onChange={(e) => setSort(e.target.value as "relevance" | "rating")}><option value="relevance">Sort: relevance</option><option value="rating">Sort: highest rated</option></select>{user && <button className={favoritesOnly ? "filter-button active" : "filter-button"} onClick={() => setFavoritesOnly(!favoritesOnly)}><Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites</button>}</div>{sent && <p className="success toast" role="status">Request sent. You can follow it from your dashboard.</p>}{reported && <p className="success toast" role="status">Report submitted for administrator review.</p>}<div className="listing-grid">{listings.map((listing) => <article className="listing" key={listing.id}>{listing.images?.[0] ? <img className="listing-cover" src={listing.images[0]} alt={`${listing.name} listing`} /> : <div className="listing-icon">{listing.type === "technician" ? <Wrench /> : listing.type === "shop" ? <Store /> : <Search />}</div>}<div className="listing-top"><div className="listing-meta"><span className="tag">{listingLabels[listing.type]}</span>{listing.moderationStatus === "approved" && listing.verified ? <span className="verified"><ShieldCheck size={14} /> Verified</span> : <span className="gura-unverified"><ShieldCheck size={14} /> Not Yet Verified</span>}</div><button className={favorites.includes(listing.id) ? "favorite active" : "favorite"} aria-label={favorites.includes(listing.id) ? `Remove ${listing.name} from favorites` : `Save ${listing.name} to favorites`} onClick={() => favorite(listing.id)}><Heart size={18} fill={favorites.includes(listing.id) ? "currentColor" : "none"} /></button></div><h3>{listing.name}</h3><p>{listing.text}</p><div className="service-chips">{listing.services.map((service) => <span key={service}>{service}</span>)}</div><small>{listing.location} · <Star size={12} fill="currentColor" /> {getListingRating(listing)} · {listReviews().filter((review) => review.listingId === listing.id).length} reviews</small><div className="listing-actions"><button className="text-button" onClick={() => { setReported(false); setSelected(listing); }}>View profile</button>{user && !listing.ownerId && ((user.role === "technician" && listing.type === "technician") || (user.role === "shop" && listing.type === "shop")) ? <button className="button small" onClick={() => claimListing(listing)}>Claim listing</button> : <button className="button small" onClick={() => { setReported(false); setSelected(listing); }}>Request help</button>}</div></article>)}</div>{!listings.length && <div className="empty-state"><Search size={28} /><h2>No matches yet</h2><p>{favoritesOnly ? "You have not saved any listings matching these filters." : "Try a different part keyword or location, or browse all local businesses."}</p></div>}{selected && <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}><div className="modal detail-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><button className="modal-close" aria-label="Close" onClick={() => setSelected(null)}><X /></button><p className="eyebrow">{listingLabels[selected.type]}</p><h2>{selected.name}</h2>{selected.images?.length ? <div className="image-gallery">{selected.images.map((image) => <img key={image} src={image} alt={`${selected.name} listing`} />)}</div> : null}<p>{selected.text}</p><p className={selected.moderationStatus === "approved" && selected.verified ? "gura-listing-verified-note" : "gura-listing-unverified-note"}><ShieldCheck size={17}/>{selected.moderationStatus === "approved" && selected.verified ? "Verified by GURA administrator" : "Not Yet Verified — this provider has not completed GURA listing approval. Review details carefully before making an inquiry."}</p>{(selected.businessPhone || selected.businessWhatsapp || selected.businessEmail) && <div className="gura-marketplace-contacts"><strong>Contact this provider</strong>{selected.businessPhone && <a href={"tel:"+selected.businessPhone.replace(/[^\d+]/g,"")}>Call {selected.businessPhone}</a>}{selected.businessWhatsapp && <a href={"https://wa.me/"+selected.businessWhatsapp.replace(/\D/g,"").replace(/^0/,"256")} target="_blank" rel="noopener noreferrer">WhatsApp {selected.businessWhatsapp}</a>}{selected.businessEmail && <a href={"mailto:"+selected.businessEmail}>Email {selected.businessEmail}</a>}</div>}<p className="availability"><strong>Availability:</strong> {selected.availability || "Contact provider to arrange a time"}</p><div className="service-chips">{selected.services.map((service) => <span key={service}>{service}</span>)}</div><p className="rating-summary"><Star size={18} fill="currentColor" /> {getListingRating(selected)} <span>{selectedReviews.length} community reviews</span></p>{selectedReviews.length ? <div className="review-list">{selectedReviews.map((review) => <blockquote key={review.id}><div>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div><p>{review.body}</p><small>{new Date(review.createdAt).toLocaleDateString()}</small></blockquote>)}</div> : <p className="muted-text">No reviews yet. Completed requests can receive the first one.</p>}{user ? <form onSubmit={sendRequest}><label>What do you need?<input name="title" required placeholder="e.g. Laptop will not turn on" /></label><div className="slot-fields"><label>Preferred date<input name="preferredDate" type="date" min={new Date().toISOString().split("T")[0]} /></label><label>Preferred time<input name="preferredTime" type="time" /></label></div><label>Details<textarea name="details" required rows={3} placeholder="Share useful context, timing, or device details." /></label><button className="button full">Send request</button></form> : <Link className="button full" to="/login">Sign in to send a request</Link>}{user && <form className="report-form" onSubmit={report}><div className="report-heading"><AlertTriangle size={16} /><strong>Report this listing</strong></div><select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option><option>Misleading information</option><option>Suspicious activity</option><option>Inappropriate content</option><option>Duplicate listing</option></select><textarea name="details" required rows={2} placeholder="Tell us what looks wrong" /><button className="text-button">Submit report</button></form>}</div></div>}</main>;
}

function AuthPage({ mode, onAuth }: { mode: "login" | "register"; onAuth: (user: User) => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "customer" as Role });
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (mode === "register" && form.password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (mode === "register" && form.password !== confirmPassword) {
      setError("Passwords do not match. Please confirm your password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        await auth.register({ id: crypto.randomUUID(), name: form.name, email: form.email.trim(), role: form.role }, form.password);
        navigate("/login?registered=1", { replace: true });
      } else {
        const user = await auth.login({ email: form.email.trim(), password: form.password });
        onAuth(user);
        navigate("/dashboard");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // Do not reveal whether an email address is registered or which credential failed.
      const isCredentialError = mode === "login" && /incorrect|invalid|credentials|password is incorrect/i.test(message);
      setError(isCredentialError ? "Invalid email or password. Please try again." : message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return <main className="auth-page gura-auth-page">
    <div className="auth-layout gura-auth-layout">
      <section className="auth-welcome gura-auth-brand gura-reference-brand">
        <Link className="auth-logo" to="/" aria-label="GURA APP home"><img src="/gura-logo.png" alt="GURA APP" /></Link>
        <div className="auth-welcome-copy">
          <p className="auth-kicker">Secure Regional Marketplace for Computer Parts</p>
          <h1>SECURE REGIONAL<br/>MARKETPLACE<br/><span>FOR COMPUTER<br/>PARTS</span></h1>
          <ul className="gura-auth-benefits"><li><CheckCircle2 size={22}/>Discovery &amp; Sourcing</li><li><CheckCircle2 size={22}/>Browse trusted suppliers</li><li><CheckCircle2 size={22}/>Secure Transactions <small>(planned)</small></li></ul>
        </div>
        <div className="gura-auth-trust"><ShieldCheck size={18}/><span>Connecting technicians, shops and suppliers</span></div>
      </section>
      <div className="gura-reference-stage"><div className="gura-laptop"><div className="gura-laptop-screen"><div className="auth-card gura-auth-card">
        <p className="eyebrow">{mode === "login" ? "Welcome back" : "Join the GURA network"}</p>
        <h1>{mode === "login" ? "Sign in to GURA" : "Create your account"}</h1>
        <p className="muted-text">{mode === "login" ? "Enter your account credentials to continue." : "Tell us a little about yourself to get started."}</p>
        {mode === "login" && searchParams.get("registered") === "1" && <div className="gura-auth-success" role="status"><CheckCircle2 size={19}/><span>Account created successfully! Please sign in with your email and password.</span></div>}{mode === "login" && searchParams.get("passwordChanged") === "1" && <div className="gura-auth-success" role="status"><CheckCircle2 size={19}/><span>Password changed successfully. Please sign in with your new password.</span></div>}
        <form onSubmit={submit} className="gura-login-form">
          {mode === "register" && <>
            <label>Full name<input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label>
            <label>Account type<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="customer">Customer / Buyer</option><option value="technician">Technician</option><option value="shop">Supplier / Repair Shop</option>
            </select></label>
          </>}
          <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com"/></label>
          <label>Password
            <span className="gura-password-field">
              <input required type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter your password"/>
              <button type="button" className="gura-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}
              </button>
            </span>
          </label>
          {mode === "register" && <label>Confirm password
            <span className="gura-password-field">
              <input required type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password"/>
              <button type="button" className="gura-password-toggle" onClick={() => setShowConfirmPassword(value => !value)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword}>
                {showConfirmPassword ? <EyeOff size={19}/> : <Eye size={19}/>}
              </button>
            </span>
          </label>}
          {error && <div className="gura-auth-error" role="alert"><AlertTriangle size={18}/><span>{error}</span></div>}
          <button className="button full gura-auth-submit" type="submit" disabled={loading} aria-busy={loading}>
            {loading && <LoaderCircle size={18} className="gura-spinner" aria-hidden="true"/>}
            {loading ? "Please wait…" : mode === "login" ? "Sign In to GURA" : "Create GURA Account"}
          </button>
        </form>
        <p className="switch-auth">{mode === "login" ? <>New to GURA? <Link to="/register">Create an account</Link></> : <>Already registered? <Link to="/login">Sign in</Link></>}</p>
        <p className="gura-auth-footnote"><ShieldCheck size={14}/> Secure connection · Email sign-in is supported; phone sign-in is planned.</p>
      </div></div><div className="gura-laptop-base" aria-hidden="true"><span className="gura-laptop-trackpad"/></div></div></div>
    </div>
  </main>;
}
function Protected({ user, children }: { user: User | null; children: React.ReactNode }) { return user ? <>{children}</> : <Navigate to="/login" replace />; }

function RequestCard({ request, user, listings, onChange }: { request: ServiceRequest; user: User; listings: Listing[]; onChange: () => void }) {
  const listing = listings.find((item) => item.id === request.listingId); const messages = listMessages().filter((message) => message.requestId === request.id); const existingReview = listReviews().find((review) => review.requestId === request.id); const [body, setBody] = useState(""); const [reviewBody, setReviewBody] = useState(""); const [rating, setRating] = useState(5); const [appointmentDate, setAppointmentDate] = useState(request.preferredDate || ""); const [appointmentTime, setAppointmentTime] = useState(request.preferredTime || "");
  const canManage = (user.role === "technician" || user.role === "shop") && listing?.ownerId === user.id;
  const send = (e: React.FormEvent) => { e.preventDefault(); if (!body.trim()) return; createMessage({ id: crypto.randomUUID(), requestId: request.id, senderId: user.id, body: body.trim(), createdAt: new Date().toISOString() }); setBody(""); onChange(); }; const confirmDate = () => { if (appointmentDate && canManage) { confirmRequestDate(request.id, appointmentDate, appointmentTime); onChange(); } };
  const review = (e: React.FormEvent) => { e.preventDefault(); if (!listing || !reviewBody.trim()) return; createReview({ id: crypto.randomUUID(), listingId: listing.id, requestId: request.id, authorId: user.id, rating, body: reviewBody.trim(), createdAt: new Date().toISOString() }); onChange(); };
  const requestedSlot = request.preferredDate ? `${new Date(`${request.preferredDate}T12:00:00`).toLocaleDateString()}${request.preferredTime ? ` at ${request.preferredTime}` : ""}` : "";
  const confirmedSlot = request.confirmedDate ? `${new Date(`${request.confirmedDate}T12:00:00`).toLocaleDateString()}${request.confirmedTime ? ` at ${request.confirmedTime}` : ""}` : "";
  return <article className="request-card"><div className="request-header"><div><span className={`request-status request-status-${request.status}`}>{request.status}</span><h3>{request.title}</h3><small>{listing?.name || "Gura listing"} · {new Date(request.createdAt).toLocaleDateString()}</small></div><div className="request-actions">{canManage && request.status === "open" && <><button onClick={() => { updateRequest(request.id, "accepted"); onChange(); }}>Accept</button><button onClick={() => { updateRequest(request.id, "declined"); onChange(); }}>Decline</button></>}{canManage && request.status === "accepted" && <><button onClick={confirmDate} disabled={!appointmentDate}>{request.confirmedDate ? "Update slot" : "Confirm slot"}</button><button onClick={() => { updateRequest(request.id, "completed"); onChange(); }}>Mark complete</button></>}{user.role === "customer" && (request.status === "open" || request.status === "accepted") && <button onClick={() => { updateRequest(request.id, "cancelled"); onChange(); }}>Cancel</button>}</div></div><p>{request.details}</p>{request.preferredDate && <p className="appointment-note"><strong>{request.confirmedDate ? "Confirmed appointment:" : "Preferred appointment:"}</strong> {request.confirmedDate ? confirmedSlot : requestedSlot}</p>}{canManage && request.status === "accepted" && !request.confirmedDate && <div className="appointment-editor"><label>Proposed date<input type="date" value={appointmentDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setAppointmentDate(e.target.value)} /></label><label>Proposed time<input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} /></label><small>Use the customer preference or propose an alternative slot.</small></div>}{messages.length > 0 && <div className="message-thread">{messages.map((message) => <p key={message.id}><MessageCircle size={14} /> {message.body}</p>)}</div>}{request.status !== "declined" && request.status !== "completed" && request.status !== "cancelled" && <form className="inline-message" onSubmit={send}><input aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to this request" /><button aria-label="Send message"><ArrowRight size={17} /></button></form>}{user.role === "customer" && request.status === "completed" && !existingReview && <form className="review-form" onSubmit={review}><strong>How did it go?</strong><div className="rating-input">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value} stars`} className={value <= rating ? "star active" : "star"} onClick={() => setRating(value)}><Star size={19} fill="currentColor" /></button>)}</div><textarea required rows={2} value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="Share a helpful note for the community" /><button className="button small">Publish review</button></form>}{existingReview && <p className="success review-published"><Check size={15} /> Review published — {existingReview.rating}/5</p>}</article>;
}

function NotificationPanel({ user }: { user: User }) {
  const [items, setItems] = useState(() => listNotifications(user.id));
  const unread = items.filter((item) => !item.read).length;
  return <section className={`panel notification-panel ${items.length ? "" : "dashboard-empty-panel"}`}><div className="panel-title"><div><p className="eyebrow">Updates</p><h2>Notifications {unread > 0 && <span className="count-pill">{unread}</span>}</h2></div>{unread > 0 && <button className="text-button" onClick={() => { markNotificationsRead(user.id); setItems(listNotifications(user.id)); }}>Mark all read</button>}</div>{items.length ? <div className="notification-list">{items.slice(0, 5).map((item) => <div className={item.read ? "notification read" : "notification"} key={item.id}><span className="notification-dot" /><span><b>{item.title}</b><small>{item.body} · {new Date(item.createdAt).toLocaleDateString()}</small></span></div>)}</div> : <p className="muted-text">New request and account updates will appear here.</p>}</section>;
}

function ListingManager({ user, listings, onChange }: { user: User; listings: Listing[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", availability: "", text: "", services: "" });
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const own = listings.filter(listing => listing.ownerId === user.id);
  const business = own[0];
  const type: ListingType = user.role === "shop" ? "shop" : "technician";
  const startEdit = () => {
    if (business) setForm({
      name: business.name, location: business.location, availability: business.availability || "",
      text: business.text, services: business.services.join(", "),
    });
    else setForm({ name:"",location:"",availability:"",text:"",services:"" });
    setNewPhotos([]);
    setError("");
    setOpen(true);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const values = {
        name:form.name.trim(), location:form.location.trim(), availability:form.availability.trim(),
        text:form.text.trim(), services:form.services.split(",").map(x=>x.trim()).filter(Boolean),
      };
      if (business) {
        await updateListing(business.id, { ...values, images:[...(business.images || []),...newPhotos] });
      } else {
        await createListing({
          id:crypto.randomUUID(),ownerId:user.id,type,...values,images:newPhotos,verified:false,rating:0,moderationStatus:"pending",
        });
      }
      setNewPhotos([]);
      setOpen(false);
      onChange();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your business."); }
    finally { setBusy(false); }
  };
  if (user.role !== "technician" && user.role !== "shop") return null;
  return <section className="panel listing-manager">
    <div className="panel-title"><div><p className="eyebrow">Your business account</p><h2>{business ? "Manage your business" : "Create your business"}</h2></div>
      {!open && <button className="button small" onClick={startEdit}>{business ? "Edit business" : "Create business"}</button>}
      {open && <button className="text-button" onClick={() => {setOpen(false);setNewPhotos([]);}}>Cancel</button>}
    </div>
    <p className="muted-text">Each shop or technician account owns one business profile. Keep your services, product gallery and business details updated here.</p>
    {own.length > 1 && <p className="gura-shop-warning">This account has older duplicate business records. Your first business is editable; contact the administrator to consolidate the others safely.</p>}
    {open && <form className="listing-form" onSubmit={submit}>
      <label>Business name<input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Location<input required maxLength={160} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <label>Availability<input maxLength={160} value={form.availability} onChange={e=>setForm({...form,availability:e.target.value})}/></label>
      <label>Business description<textarea required rows={3} maxLength={4000} value={form.text} onChange={e=>setForm({...form,text:e.target.value})}/></label>
      <label>{user.role==="shop"?"Products & services offered":"Repair services"} <small>(comma-separated)</small><input required value={form.services} onChange={e=>setForm({...form,services:e.target.value})} placeholder="Laptop screens, RAM, SSDs, Repairs"/></label>
      <label>Upload marketplace photographs (up to 6 total)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || newPhotos.length+(business?.images?.length||0)>=6} onChange={async e=>{try{const photos=await prepareListingPhotos(e.target.files,6-newPhotos.length-(business?.images?.length||0));setNewPhotos(previous=>[...previous,...photos]);setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Unable to prepare photos.");}e.target.value="";}} /></label>
      {!!newPhotos.length && <div className="media-grid">{newPhotos.map((photo,index)=><div className="media-item" key={index}><img src={photo} alt={`Selected business photo ${index+1}`}/><button type="button" aria-label={`Remove selected photo ${index+1}`} onClick={()=>setNewPhotos(photos=>photos.filter((_,i)=>i!==index))}><Trash2 size={14}/></button></div>)}</div>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy?"Saving...":business?"Save business updates":"Create business"}</button>
    </form>}
    {own.map(listing=><div key={listing.id} className="listing-owner-card">
      <div className="admin-row"><span><b>{listing.name}</b><small>{listing.location} · {listing.verified && listing.moderationStatus==="approved"?"Verified":"Not Yet Verified"}</small></span><span className="tag">{listing.moderationStatus||"pending"}</span></div>
      <ListingMediaRoom listing={listing} onChange={onChange}/>
    </div>)}
    {!business && !open && <p className="muted-text">Create your business once and add images immediately. Your profile appears on the marketplace as Not Yet Verified until approval.</p>}
  </section>;
}

function ListingMediaRoom({ listing, onChange }: { listing: Listing; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const images = listing.images || [];
  const label = listing.type === "shop" ? "Marketplace product photos" : "Marketplace service photos";
  const help = listing.type === "shop" ? "Show products and stock. Add shop-front photos under My Profile instead." : "Show completed repair work and services. Add premises photos under My Profile instead.";
  const addImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const photos = await prepareListingPhotos(event.target.files, 6 - images.length);
      if (!photos.length) return;
      const saved = await updateListing(listing.id, { images: [...images, ...photos] });
      setNotice(saved.verified && saved.moderationStatus === "approved"
        ? "Photos saved and visible on your marketplace business."
        : "Photos saved and visible on your marketplace business with a Not Yet Verified badge.");
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload photos.");
    } finally { setBusy(false); event.target.value = ""; }
  };
  const removeImage = async (image: string) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await updateListing(listing.id, { images: images.filter((item) => item !== image) });
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove image.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="media-room"><div className="media-room-heading"><span><strong><ImageIcon size={17} /> {label}</strong><small>{help} Up to 6 images; JPG, PNG or WebP originals up to 8 MB each are automatically resized.</small></span><label className="upload-button"><Upload size={15} /> {busy ? "Reading..." : "Add images"}<input type="file" accept="image/*" multiple disabled={busy || images.length >= 6} onChange={addImages} /></label></div>{images.length ? <div className="media-grid">{images.map((image, index) => <div className="media-item" key={image}><img src={image} alt={`${listing.name} image ${index + 1}`} /><button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => removeImage(image)}><Trash2 size={14} /></button></div>)}</div> : <p className="muted-text">No images uploaded yet. Images help customers and administrators verify the listing.</p>}{error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}{listing.moderationStatus !== "approved" && <p className="muted-text">This listing is {listing.moderationStatus || "pending"}. {listing.moderationStatus === "rejected" ? "Rejected listings are hidden from public search." : "It is visible publicly with a Not Yet Verified badge until an administrator approves it."}</p>}<small className="media-note">MVP storage: images are kept with the listing record. Move them to Supabase Storage before storing large production galleries.</small></div>;
}

function FavoritesPanel({ user, listings }: { user: User; listings: Listing[] }) {
  const favorites = listings.filter((listing) => listFavorites(user.id).includes(listing.id));
  return <section className={`panel favorites-panel ${favorites.length ? "" : "dashboard-empty-panel"}`}><div className="panel-title"><div><p className="eyebrow">Saved for later</p><h2>Favorites</h2></div><Link className="text-link" to="/directory">Browse directory</Link></div>{favorites.length ? <div className="favorite-list">{favorites.map((listing) => <div className="favorite-row" key={listing.id}><span><b>{listing.name}</b><small>{listingLabels[listing.type]} · {listing.location}</small></span><span className="rating-summary"><Star size={14} fill="currentColor" /> {getListingRating(listing)}</span></div>)}</div> : <p className="muted-text">Save a listing in the directory and it will appear here.</p>}</section>;
}

function AdminUsersPanel({ currentUser, onChange }: { currentUser: User; onChange: () => void }) {
  const users = domainAdapter.listUsers().filter((item) => item.id !== currentUser.id);
  const act = (item: User, update: Partial<User>, action: string) => { domainAdapter.updateUser(item.id, update); createAuditEvent({ id: crypto.randomUUID(), actorId: currentUser.id, action, target: item.id, details: `${action}: ${item.email}`, createdAt: new Date().toISOString() }); onChange(); };
  return <section className="panel admin-users-panel"><div className="panel-title"><div><p className="eyebrow">Community administration</p><h2>User accounts</h2></div><span className="count-pill">{users.length}</span></div>{users.length ? users.map((item) => <div className="admin-row" key={item.id}><span><b>{item.name}</b><small>{roleLabels[item.role]} · {item.email} {item.suspended ? "· Suspended" : ""}</small></span><span className="request-actions"><span className={item.verified ? "verified" : "tag"}>{item.verified ? "Verified" : "Unverified"}</span><button onClick={() => act(item, { verified: !item.verified }, item.verified ? "Unverified provider" : "Verified provider")}>{item.verified ? "Unverify" : "Verify"}</button><button onClick={() => act(item, { suspended: !item.suspended }, item.suspended ? "Restored account" : "Suspended account")}>{item.suspended ? "Restore" : "Suspend"}</button></span></div>) : <p className="muted-text">No other registered accounts yet.</p>}<p className="muted-text">Account controls are local MVP demonstrations and must be protected by server-side authorization in production.</p></section>;
}

function AuditPanel() {
  const events = listAuditEvents().slice(0, 8);
  return <><section className="panel audit-panel"><div className="panel-title"><div><p className="eyebrow">Audit trail</p><h2>Recent admin activity</h2></div><span className="count-pill">{events.length}</span></div>{events.length ? <div className="audit-list">{events.map((event) => <div className="audit-row" key={event.id}><span className="audit-icon">•</span><span><b>{event.action}</b><small>{event.details} · {new Date(event.createdAt).toLocaleString()}</small></span></div>)}</div> : <p className="muted-text">Administrative actions will appear here.</p>}</section><DemoDataPanel /></>;
}
function DemoDataPanel() {
  const download = () => {
    const blob = new Blob([JSON.stringify(exportDomainData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gura-demo-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const reset = () => {
    if (!window.confirm("Reset local marketplace data? Registered accounts will be kept.")) return;
    resetDomainData();
    window.location.reload();
  };
  return <section className="panel demo-data-panel"><div className="panel-title"><div><p className="eyebrow">Developer handoff</p><h2>Local data controls</h2></div><span className="tag">Local only</span></div><p className="muted-text">Export the current domain snapshot before replacing this adapter with a server API. Reset removes marketplace records but keeps registered accounts.</p><div className="request-actions"><button onClick={download}><Download size={15} /> Export JSON</button><button onClick={reset}><RotateCcw size={15} /> Reset domain data</button></div></section>;
}


/** Profile galleries deliberately keep premises photos separate from public listing media. */
function ProfileMediaSection({ user, onUserUpdate }: { user: User; onUserUpdate: (user: User) => void }) {
  const [busy, setBusy] = useState<"location" | "marketplace" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [, setVersion] = useState(0);
  const ownListings = listListings().filter((listing) => listing.ownerId === user.id);
  const current = ownListings.find((listing) => listing.id === selectedId) || ownListings[0];
  const locationImages = user.locationImages || [];

  const readImages = async (files: FileList | null, room: number) => {
    const selected = Array.from(files || []);
    if (!selected.length) return [];
    if (selected.length > room) throw new Error(`Only ${room} more photo(s) can be added to this gallery.`);
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8_000_000)) {
      throw new Error("Use JPEG, PNG or WebP photos smaller than 8 MB each.");
    }
    // Resize camera originals before saving: base64 images are stored in the database
    // and mirrored in the browser cache. Keeping files small avoids quota failures.
    return Promise.all(selected.map(async (file) => {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = objectUrl;
        await img.decode();
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image resizing is unavailable in this browser.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        let encoded = canvas.toDataURL("image/jpeg", 0.78);
        for (let attempt = 0; encoded.length > 280_000 && attempt < 5; attempt += 1) {
          const resized = document.createElement("canvas");
          resized.width = Math.max(1, Math.round(canvas.width * 0.8));
          resized.height = Math.max(1, Math.round(canvas.height * 0.8));
          const nextContext = resized.getContext("2d");
          if (!nextContext) break;
          nextContext.drawImage(canvas, 0, 0, resized.width, resized.height);
          canvas.width = resized.width;
          canvas.height = resized.height;
          context.drawImage(resized, 0, 0);
          encoded = canvas.toDataURL("image/jpeg", Math.max(0.48, 0.72 - attempt * 0.06));
        }
        if (encoded.length > 350_000) throw new Error("This photo is too complex to compress. Try a smaller image.");
        return encoded;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }));
  };

  const saveLocation = async (next: string[]) => {
    setBusy("location"); setError(""); setNotice("");
    try {
      const updated = await auth.saveProfile({ locationImages: next });
      onUserUpdate(updated);
      setNotice("Premises photos saved to your private account profile. They are not published in marketplace listings.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save premises photos.");
    } finally { setBusy(null); }
  };
  const addLocation = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const photos = await readImages(event.target.files, 4 - locationImages.length);
      if (photos.length) await saveLocation([...locationImages, ...photos]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read photos."); }
    event.target.value = "";
  };

  const saveMarketplace = async (next: string[]) => {
    if (!current) return;
    setBusy("marketplace"); setError(""); setNotice("");
    try {
      const updated = await updateListing(current.id, { images: next });
      setVersion((value) => value + 1);
      setNotice(updated.moderationStatus === "approved"
        ? "Marketplace gallery saved. Images are visible with your approved listing."
        : "Gallery saved. Photos are visible with a Not Yet Verified badge until administrator approval.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save marketplace photos.");
    } finally { setBusy(null); }
  };
  const addMarketplace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const photos = await readImages(event.target.files, 6 - (current?.images?.length || 0));
      if (photos.length) await saveMarketplace([...(current?.images || []), ...photos]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read photos."); }
    event.target.value = "";
  };

  return <section className="gura-profile-media-section" aria-label="Profile and marketplace photos">
    <div className="gura-profile-media-heading"><div><p className="eyebrow">Your images</p><h2>Manage your photos</h2><p>Choose where each image belongs. Premises photos stay in your account profile; product and work photos belong to marketplace listings.</p></div></div>
    {error && <p role="alert" className="error gura-profile-feedback">{error}</p>}
    {notice && <p role="status" className="success gura-profile-feedback">{notice}</p>}
    <div className="gura-profile-media-grid">
      <div className="gura-profile-card gura-profile-media-card">
        <div className="gura-media-card-title"><MapPin size={20}/><div><h3>Location &amp; premises photos</h3><p>Photos of your shop front, workplace, or physical location. Visible only in your account profile, never in the marketplace gallery.</p></div></div>
        <div className="gura-media-gallery">{locationImages.length ? locationImages.map((src, index) => <div className="gura-media-thumb" key={index}><img src={src} alt={`Your premises image ${index + 1}`}/><button type="button" aria-label={`Remove premises photo ${index + 1}`} disabled={busy !== null} onClick={() => void saveLocation(locationImages.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>) : <p className="gura-media-empty">No premises photos uploaded.</p>}</div>
        <div className="gura-media-bottom"><span>{locationImages.length} / 4 photos</span><label className="upload-button"><Upload size={15}/>{busy === "location" ? "Saving..." : "Add premises photos"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy !== null || locationImages.length >= 4} onChange={addLocation}/></label></div>
      </div>
      <div className="gura-profile-card gura-profile-media-card">
        <div className="gura-media-card-title"><Store size={20}/><div><h3>{user.role === "shop" ? "Product photos for marketplace" : "Service &amp; work photos for marketplace"}</h3><p>These photos appear with your public listing immediately, marked Not Yet Verified until an administrator approves it.</p></div></div>
        {current ? <>
          {ownListings.length > 1 && <label className="gura-media-picker">Choose listing<select value={current.id} onChange={(event) => { setSelectedId(event.target.value); setNotice(""); setError(""); }}>{ownListings.map((listing) => <option key={listing.id} value={listing.id}>{listing.name}</option>)}</select></label>}
          <p className="gura-media-listing-status"><b>{current.name}</b> <span className="tag">{current.moderationStatus || "pending"}</span></p>
          <div className="gura-media-gallery">{current.images?.length ? current.images.map((src, index) => <div className="gura-media-thumb" key={index}><img src={src} alt={`Listing photo ${index + 1}`}/><button type="button" aria-label={`Remove listing photo ${index + 1}`} disabled={busy !== null} onClick={() => void saveMarketplace((current.images || []).filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>) : <p className="gura-media-empty">No marketplace photos for this listing.</p>}</div>
          <div className="gura-media-bottom"><span>{current.images?.length || 0} / 6 photos</span><label className="upload-button"><Upload size={15}/>{busy === "marketplace" ? "Saving..." : "Add marketplace photos"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy !== null || (current.images?.length || 0) >= 6} onChange={addMarketplace}/></label></div>
        </> : <div className="gura-media-no-listing"><p>Create a shop or technician listing first, then upload its product or service photos here.</p><Link className="button small" to="/dashboard">Create a listing <ArrowRight size={15}/></Link></div>}
      </div>
    </div>
    <p className="gura-profile-media-footnote">JPEG, PNG or WebP, up to 8 MB per source photo (resized automatically). Images are saved with your account or listing record; avoid uploading personal documents or sensitive details.</p>
  </section>;
}

function ProfilePage({ user, onUserUpdate }: { user: User; onUserUpdate: (user: User) => void }) {
  const [profile, setProfile] = useState({ name: user.name, location: user.location || "", bio: user.bio || "",
    businessPhone:user.businessPhone || "", businessWhatsapp:user.businessWhatsapp || "", businessEmail:user.businessEmail || "" });
  const [passwords, setPasswords] = useState({current:"",next:"",confirm:""});
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [passwordError,setPasswordError]=useState("");
  const [passwordVisible,setPasswordVisible]=useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const listings = listListings().filter((item) => item.ownerId === user.id);
  const requests = listRequests().filter((item) => user.role === "customer" ? item.customerId === user.id : item.providerId === user.id || listings.some((listing) => listing.id === item.listingId && listing.ownerId === user.id));
  const isProvider = user.role === "shop" || user.role === "technician";
  const roleCopy: Record<Role, { title: string; intro: string; bio: string; tips: string[] }> = {
    customer: { title: "My customer profile", intro: "Manage the details used when you connect with local technicians and suppliers.", bio: "Tell service providers what kind of computer support you usually need (optional).", tips: ["Browse nearby computer parts and repair services.", "Track your service requests from the dashboard.", "Save useful suppliers and technicians."] },
    technician: { title: "My technician profile", intro: "Present yourself professionally so customers understand your expertise and where you work.", bio: "Describe your repair specialties, experience, and the devices you service.", tips: ["Describe your technical specialties and repair experience.", "Maintain your availability and add work photos to marketplace listings.", "Your listing photos become searchable after approval; premises photos stay on this profile."] },
    shop: { title: "My shop profile", intro: "Build trust with customers looking for computer parts, accessories, and repair shops.", bio: "Introduce your business, product categories, and what makes your shop useful to customers.", tips: ["Add your business location and product categories.", "Add product photos to marketplace listings and shop-front photos here.", "Approve-ready listings appear in marketplace search after review."] },
    administrator: { title: "My administrator profile", intro: "Keep your account details up to date while managing the GURA marketplace.", bio: "Internal profile notes or administrative responsibilities (optional).", tips: ["Review pending listings and reported content in the dashboard.", "Use a strong private password and keep administrator access restricted.", "Administrator access is determined by your server account role."] },
  };
  const details = roleCopy[user.role];
  const first = user.name.trim().charAt(0).toUpperCase() || "G";
  const second = user.name.trim().split(/\s+/)[1]?.charAt(0).toUpperCase() || "";
  const completed = [user.name.trim(), user.location?.trim(), user.bio?.trim()].filter(Boolean).length;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const updated = await auth.saveProfile({ name: profile.name.trim(), location: profile.location.trim(), bio: profile.bio.trim(),
        ...(isProvider ? {businessPhone:profile.businessPhone.trim(),businessWhatsapp:profile.businessWhatsapp.trim(),businessEmail:profile.businessEmail.trim()}:{}),
      });
      onUserUpdate(updated);
      setProfile({ name: updated.name, location: updated.location || "", bio: updated.bio || "",businessPhone:updated.businessPhone || "",businessWhatsapp:updated.businessWhatsapp || "",businessEmail:updated.businessEmail || "" });
      setEditing(false);
      setMessage("Your profile changes were saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    setProfile({ name: user.name, location: user.location || "", bio: user.bio || "",businessPhone:user.businessPhone || "",businessWhatsapp:user.businessWhatsapp || "",businessEmail:user.businessEmail || "" });
    setEditing(false); setError(""); setMessage("");
  };
  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();setPasswordError("");setMessage("");
    if(passwords.next!==passwords.confirm){setPasswordError("New passwords do not match.");return;}
    if(passwords.next.length<8){setPasswordError("New password must have at least 8 characters.");return;}
    setPasswordBusy(true);
    try{
      await auth.changePassword(passwords.current,passwords.next,passwords.confirm);
      setPasswords({current:"",next:"",confirm:""});
      window.location.assign("/login?passwordChanged=1");
    }catch(cause){setPasswordError(cause instanceof Error?cause.message:"Unable to update password.");}
    finally{setPasswordBusy(false);}
  };
  return <main className="container gura-profile-page">
    <div className="gura-profile-breadcrumb"><Link to="/dashboard">Dashboard</Link><span>/</span><strong>My Profile</strong></div>
    <header className="gura-profile-header">
      <div><p className="eyebrow">Account &amp; identity</p><h1>{details.title}</h1><p>{details.intro}</p></div>
      <Link className="gura-profile-back" to="/dashboard"><ArrowRight size={16}/> Back to dashboard</Link>
    </header>
    <section className="gura-profile-hero" aria-label="Account summary">
      <div className="gura-profile-avatar" aria-hidden="true">{first}{second}</div>
      <div className="gura-profile-identity"><span className="gura-profile-role">{roleLabels[user.role]}</span><h2>{user.name}</h2><p>{user.email}</p><div className="gura-profile-meta"><span><MapPin size={15}/>{user.location || "Location not added"}</span><span><ShieldCheck size={15}/>{user.verified ? "Verified account" : "Account details"}</span></div></div>
      <div className="gura-profile-completeness"><span>Profile completeness</span><strong>{Math.round(completed / 3 * 100)}%</strong><div className="gura-profile-progress"><span style={{ width: `${completed / 3 * 100}%` }}/></div><small>Add your location and description to complete your profile.</small></div>
    </section>
    {message && <p className="success gura-profile-feedback" role="status">{message}</p>}
    {error && <p className="error gura-profile-feedback" role="alert">{error}</p>}
    <div className="gura-profile-grid">
      <section className="gura-profile-card gura-profile-main">
        <div className="gura-profile-card-header"><div><h2>Personal information</h2><p>Update your details here; manage photos in the separate galleries below.</p></div>{!editing && <button type="button" className="gura-profile-edit" onClick={() => { setEditing(true); setMessage(""); }}><Wrench size={15}/> Edit profile</button>}</div>
        {editing ? <form onSubmit={submit} className="gura-profile-form">
          <div className="gura-profile-form-grid"><label>Full name<input required maxLength={120} autoComplete="name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })}/></label><label>{user.role === "shop" ? "Shop location / town" : "Location / town"}<input maxLength={160} autoComplete="address-level2" placeholder="e.g. Kabale, Uganda" value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })}/></label></div>
          {isProvider && <div className="gura-profile-public-contacts">
            <h3>Marketplace contact information</h3><p>Only the details you enter here will be displayed publicly on your business and product listings. Your sign-in email stays private.</p>
            <div className="gura-profile-form-grid">
              <label>Business phone<input type="tel" inputMode="tel" placeholder="+256 7XXXXXXXX" value={profile.businessPhone} onChange={event=>setProfile({...profile,businessPhone:event.target.value})}/></label>
              <label>WhatsApp number<input type="tel" inputMode="tel" placeholder="+256 7XXXXXXXX" value={profile.businessWhatsapp} onChange={event=>setProfile({...profile,businessWhatsapp:event.target.value})}/></label>
            </div>
            <label>Public business email (optional)<input type="email" placeholder="shop@example.com" value={profile.businessEmail} onChange={event=>setProfile({...profile,businessEmail:event.target.value})}/></label>
          </div>}
          <label>{user.role === "shop" ? "About your business" : user.role === "technician" ? "Professional summary" : "About me"}<textarea maxLength={2000} rows={5} placeholder={details.bio} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })}/><small>{profile.bio.length}/2000 characters</small></label>
          <div className="gura-profile-form-actions"><button className="button" disabled={saving || !profile.name.trim()}>{saving ? "Saving changes..." : "Save changes"}</button><button type="button" className="gura-profile-cancel" disabled={saving} onClick={cancel}>Cancel</button></div>
        </form> : <div className="gura-profile-details">
          <div><span>Full name</span><strong>{user.name}</strong></div>
          <div><span>Email address</span><strong>{user.email}</strong><small>Your account email is read-only.</small></div>
          <div><span>Location</span><strong>{user.location || "Not provided"}</strong></div>{isProvider && <div className="gura-profile-contact-values"><span>Public marketplace contacts</span><strong>{user.businessPhone || "No phone added"}</strong><strong>{user.businessWhatsapp ? "WhatsApp: "+user.businessWhatsapp : "WhatsApp not added"}</strong><strong>{user.businessEmail || "No public email added"}</strong><small>Only these business contact details are shared publicly.</small></div>}
          <div className="gura-profile-bio"><span>{user.role === "shop" ? "Business description" : user.role === "technician" ? "Professional summary" : "About"}</span><p>{user.bio || "No description added yet. Edit your profile to add one."}</p></div>
        </div>}
      </section>
      <aside className="gura-profile-sidebar">
        <section className="gura-profile-card"><h2>{user.role === "shop" ? "Storefront overview" : user.role === "technician" ? "Professional activity" : user.role === "administrator" ? "Admin workspace" : "Your GURA activity"}</h2>
          {isProvider ? <div className="gura-profile-stats"><div><strong>{listings.length}</strong><span>My listings</span></div><div><strong>{listings.filter((item) => item.moderationStatus === "approved").length}</strong><span>Approved</span></div><div><strong>{listings.filter((item) => item.moderationStatus === "pending").length}</strong><span>Pending review</span></div></div> : <div className="gura-profile-stats"><div><strong>{user.role === "administrator" ? listListings().length : requests.length}</strong><span>{user.role === "administrator" ? "Marketplace listings" : "Requests"}</span></div><div><strong>{user.role === "administrator" ? listListings().filter((item) => item.moderationStatus === "pending").length : requests.filter((item) => item.status === "completed").length}</strong><span>{user.role === "administrator" ? "Pending review" : "Completed"}</span></div></div>}
          <Link className="gura-profile-action-link" to="/dashboard">Manage from dashboard <ArrowRight size={16}/></Link>
        </section>
        <section className="gura-profile-card"><h2>{user.role === "shop" ? "Grow your shop presence" : user.role === "technician" ? "Build your reputation" : user.role === "administrator" ? "Account responsibilities" : "Make the most of GURA"}</h2><ul className="gura-profile-tips">{details.tips.map((tip) => <li key={tip}><CheckCircle2 size={17}/><span>{tip}</span></li>)}</ul></section>
        <section className="gura-profile-card gura-profile-security"><h2><LockKeyhole size={18}/> Account &amp; security</h2><div><span>Sign-in email</span><strong>{user.email}</strong></div><div><span>Account access</span><strong>{roleLabels[user.role]}</strong></div><form onSubmit={changePassword} className="gura-profile-password-form">
            <label>Current password<input required type={passwordVisible?"text":"password"} autoComplete="current-password" value={passwords.current} onChange={e=>setPasswords({...passwords,current:e.target.value})}/></label>
            <label>New password<input required minLength={8} maxLength={128} type={passwordVisible?"text":"password"} autoComplete="new-password" value={passwords.next} onChange={e=>setPasswords({...passwords,next:e.target.value})}/></label>
            <label>Confirm new password<input required minLength={8} maxLength={128} type={passwordVisible?"text":"password"} autoComplete="new-password" value={passwords.confirm} onChange={e=>setPasswords({...passwords,confirm:e.target.value})}/></label>
            <label className="gura-password-visibility"><input type="checkbox" checked={passwordVisible} onChange={e=>setPasswordVisible(e.target.checked)}/> Show passwords</label>
            {passwordError && <p className="error" role="alert">{passwordError}</p>}
            <button type="submit" className="button" disabled={passwordBusy}>{passwordBusy?"Updating...":"Change password"}</button>
            <small>For security, changing your password signs you out on all devices.</small>
          </form></section>
      </aside>
    </div>
    {(user.role === "shop" || user.role === "technician") && <ProfileMediaSection user={user} onUserUpdate={onUserUpdate} />}
  </main>;
}

function Dashboard({ user, onUserUpdate }: { user: User; onUserUpdate: (user: User) => void }) {
  const [saved, setSaved] = useState(false); const [refresh, setRefresh] = useState(0); const [requestFilter, setRequestFilter] = useState<"all" | ServiceRequest["status"]>("all"); const [profile, setProfile] = useState({ name: user.name, location: user.location || "", bio: user.bio || "" }); const listings = listListings(); const allRequests = listRequests().filter((request) => user.role === "customer" ? request.customerId === user.id : user.role === "administrator" ? true : request.providerId === user.id || listings.some((listing) => listing.id === request.listingId && listing.ownerId === user.id)); const requests = allRequests.filter((request) => requestFilter === "all" || request.status === requestFilter);
  const save = async (e: React.FormEvent) => { e.preventDefault(); const updated = await auth.saveProfile(profile); onUserUpdate(updated); setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const descriptions: Record<Role, string> = { customer: "Find help, compare options, and keep your electronics moving.", technician: "Manage incoming requests and build a trusted local presence.", shop: "Present your shop and respond to customers looking for useful tech.", administrator: "Review activity and keep the Gura community healthy." };
  const metricCards = [{ label: "Total requests", value: allRequests.length }, { label: "Open", value: allRequests.filter((request) => request.status === "open").length }, { label: "Completed", value: allRequests.filter((request) => request.status === "completed").length }, { label: "Live listings", value: listings.filter((listing) => listing.moderationStatus !== "rejected").length }];
  const [moderationError, setModerationError] = useState("");
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const moderateListing = async (id: string, status: "approved" | "rejected") => {
    setModerationError("");
    setModeratingId(id);
    try {
      await updateListingStatus(id, status);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setModerationError(cause instanceof Error ? cause.message : "Unable to update listing approval.");
    } finally { setModeratingId(null); }
  };
  const reports = listReports().filter((report) => report.status === "open");
  return <main className="container page"><div className="dashboard-head"><div><p className="eyebrow">{roleLabels[user.role]} dashboard</p><h1>Hello, {user.name.split(" ")[0]}.</h1><p className="lede narrow">{descriptions[user.role]}</p></div><span className="role-pill">{roleLabels[user.role]}</span></div><div className="gura-dashboard-profile-banner"><div className="gura-dashboard-profile-icon"><Store size={24}/></div><div><h2>Your account, your marketplace</h2><p>View your personal details, account information and role-specific profile.</p></div><Link className="button small" to="/profile">View my profile <ArrowRight size={16}/></Link></div><div className="metric-grid">{metricCards.map((metric) => <div className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>  <NotificationPanel user={user} /><FavoritesPanel user={user} listings={listings} /><ListingManager user={user} listings={listings} onChange={() => setRefresh((value) => value + 1)} />{(user.role === "shop" || user.role === "technician") && <ProviderInventory user={user} hasBusiness={listings.some(listing => listing.ownerId === user.id)} />}{user.role === "administrator" && <AdminUsersPanel currentUser={user} onChange={() => setRefresh((value) => value + 1)} />}<section className="panel requests-panel"><div className="panel-title"><div><p className="eyebrow">Requests & conversations</p><h2>{user.role === "customer" ? "Your requests" : "Your assigned requests"}</h2></div><div className="panel-controls"><select aria-label="Filter requests" value={requestFilter} onChange={(e) => setRequestFilter(e.target.value as typeof requestFilter)}><option value="all">All statuses</option><option value="open">Open</option><option value="accepted">Accepted</option><option value="completed">Completed</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select><Link className="text-link" to="/directory">Find more help</Link></div></div>{requests.length ? requests.map((request) => <RequestCard key={`${request.id}-${refresh}`} request={request} user={user} listings={listings} onChange={() => setRefresh((value) => value + 1)} />) : <div className="empty-state compact"><ClipboardList size={25} /><p>No requests match this filter.</p></div>}</section>{user.role === "administrator" && <><section className="panel"><div className="panel-title"><div><p className="eyebrow">Admin tools</p><h2>Listing moderation</h2></div></div>{moderationError && <p role="alert" className="error">{moderationError}</p>}{listings.filter((listing) => (listing.moderationStatus || "approved") === "pending").map((listing) => <div className="admin-row" key={listing.id}><span><b>{listing.name}</b><small>{listingLabels[listing.type]} · {listing.location}</small></span><span className="request-actions"><button disabled={moderatingId === listing.id} onClick={() => void moderateListing(listing.id, "approved")}>Approve & Verify</button><button disabled={moderatingId === listing.id} onClick={() => void moderateListing(listing.id, "rejected")}>Reject</button></span></div>)}<p className="muted-text">Pending listings appear publicly as Not Yet Verified. Approving one changes its badge to Verified; rejecting it removes it from public search.</p>  </section><section className="panel"><div className="panel-title"><div><p className="eyebrow">Trust & safety</p><h2>Listing reports</h2></div><span className="count-pill">{reports.length}</span></div>{reports.length ? reports.map((report) => <div className="admin-row" key={report.id}><span><b>{listings.find((listing) => listing.id === report.listingId)?.name || "Unknown listing"}</b><small>{report.reason} · {report.details}</small></span><span className="request-actions"><button onClick={() => { updateReportStatus(report.id, "resolved"); createAuditEvent({ id: crypto.randomUUID(), actorId: user.id, action: "Resolved listing report", target: report.listingId, details: report.reason, createdAt: new Date().toISOString() }); setRefresh((value) => value + 1); }}>Resolve</button>  <button onClick={() => { updateReportStatus(report.id, "dismissed"); createAuditEvent({ id: crypto.randomUUID(), actorId: user.id, action: "Dismissed listing report", target: report.listingId, details: report.reason, createdAt: new Date().toISOString() }); setRefresh((value) => value + 1); }}>Dismiss</button></span></div>) : <p className="muted-text">No open listing reports.</p>}</section><AuditPanel/></>}</main>;
}

export default function App() { const [user, setUser] = useState<User | null>(() => auth.getCurrentUser()); const [dataVersion, setDataVersion] = useState(0); useEffect(() => { void refreshSession().then(setUser).catch((error) => console.error("Unable to verify GURA session", error)); }, []); useEffect(() => { hydrateDomain().then(() => setDataVersion((value) => value + 1)).catch((error) => console.error("Unable to hydrate API domain data", error)); }, [user]); const logout = async () => { await auth.logout(); setUser(null); }; return <Layout user={user} onLogout={logout}><Routes key={dataVersion}><Route path="/" element={<FreshHome />} /><Route path="/directory" element={<Directory user={user} />} /><Route path="/shop" element={<ShopPage />} /><Route path="/shop/product/:id" element={<ProductPage />} /><Route path="/cart" element={<CartPage />} /><Route path="/checkout" element={<CheckoutPage user={user} />} /><Route path="/orders" element={<OrdersPage user={user} />} /><Route path="/login" element={user ? <Navigate to="/dashboard" /> : <AuthPage mode="login" onAuth={setUser} />} /><Route path="/register" element={user ? <Navigate to="/dashboard" /> : <AuthPage mode="register" onAuth={setUser} />} /><Route path="/dashboard" element={<Protected user={user}>{user && <Dashboard user={user} onUserUpdate={setUser} />}</Protected>} /><Route path="/profile" element={<Protected user={user}>{user && <ProfilePage user={user} onUserUpdate={setUser} />}</Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout>; }
