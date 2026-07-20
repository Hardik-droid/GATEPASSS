import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import UniversalQrCard from "./UniversalQrCard";
import { 
  EventItem, 
  Ticket, 
  Order, 
  UserProfile, 
  TicketStatus 
} from "../types";
import { 
  Calendar, 
  MapPin, 
  Ticket as TicketIcon, 
  ChevronRight, 
  Search, 
  Users, 
  CheckCircle2, 
  CreditCard,
  Download,
  Shield,
  Clock,
  X,
  Sparkles,
  Info,
  Heart,
  Share2,
  Globe,
  Map,
  ArrowRight,
  ArrowLeft,
  Music2,
  QrCode,
  Lock
} from "lucide-react";

interface AttendeeEventsListProps {
  events: EventItem[];
  user: UserProfile;
  onBookTicket: (order: Order, ticket: Ticket) => void;
}

export default function AttendeeEventsList({ events, user, onBookTicket }: AttendeeEventsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  
  // Custom states matching Shotgun visual uploads
  const [currentLocation, setCurrentLocation] = useState<string>("Paris");
  const [favorites, setFavorites] = useState<string[]>(["ev4"]); // Default rock-en-seine pre-favorited as in mockup
  const [interestMap, setInterestMap] = useState<Record<string, boolean>>({
    ev5: true // We Love Green pre-interested as in mockup
  });
  const [showToastMessage, setShowToastMessage] = useState<string | null>(null);

  // New interactive scanner simulator modal state
  const [isAttendeeScannerOpen, setIsAttendeeScannerOpen] = useState(false);

  // Checkout Booking State
  const [isBooking, setIsBooking] = useState(false);
  const [selectedTicketCat, setSelectedTicketCat] = useState<string>("");
  const [ticketQty, setTicketQty] = useState(1);
  const [attendeeName, setAttendeeName] = useState(user.name);
  const [attendeeEmail, setAttendeeEmail] = useState(user.email);
  const [attendeePhone, setAttendeePhone] = useState(user.phone);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "upi" | "cash">("online");
  const [isCheckoutSuccess, setIsCheckoutSuccess] = useState(false);
  const [lastGeneratedTicketCode, setLastGeneratedTicketCode] = useState("");
  const [lastBookedTicket, setLastBookedTicket] = useState<{qrToken: string; attendeeName: string; categoryName: string; price: number; orderId: string; eventTitle: string; eventVenue: string; eventDate: string; ticketId: string} | null>(null);
  const ticketCardRef = useRef<HTMLDivElement>(null);

  const triggerToast = (msg: string) => {
    setShowToastMessage(msg);
    setTimeout(() => setShowToastMessage(null), 3000);
  };

  const toggleFavorite = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorites.includes(eventId)) {
      setFavorites(favorites.filter(id => id !== eventId));
      triggerToast("Removed from your favorite lineup");
    } else {
      setFavorites([...favorites, eventId]);
      triggerToast("Added to your lineup! 💖");
    }
  };

  const toggleInterest = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = !!interestMap[eventId];
    setInterestMap({ ...interestMap, [eventId]: !current });
    triggerToast(!current ? "Marked as Interested! 🌟" : "Removed interest");
  };

  const handleShareEvent = (event: EventItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareText = `🎵 *Afterlife Special Invitation*\nJoin me for *${event.title}*!\n📍 Venue: *${event.venue}*\n🗓️ Date: *${new Date(event.startTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}*\n🎟️ Book fast on GatePass Pro!\n_https://gatepass.io/event/${event.id}_`;
    navigator.clipboard.writeText(shareText);
    triggerToast("Event details copied to clipboard! Share the vibe ⚡");
  };

  // Filter Categories list
  const filterCategories = ["All", "Concert", "College Fest", "Marathon", "Workshop"];

  // Filtered Events
  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          event.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          event.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Normalize category match
    const categoryQuery = selectedCategory === "All" || 
      (selectedCategory === "Concert" && event.eventType.toLowerCase() === "concert") ||
      (selectedCategory === "College Fest" && event.eventType.toLowerCase() === "college fest") ||
      (selectedCategory === "Marathon" && event.eventType.toLowerCase() === "marathon") ||
      (selectedCategory === "Workshop" && event.eventType.toLowerCase() === "workshop");

    return matchesSearch && categoryQuery;
  });

  const handleOpenEventDetails = (event: EventItem) => {
    setSelectedEvent(event);
    setIsBooking(false);
    setIsCheckoutSuccess(false);
    if (event.ticketCategories.length > 0) {
      setSelectedTicketCat(event.ticketCategories[0].id);
    }
  };

  const handleConfirmBooking = (e?: React.FormEvent | React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedEvent) return;

    const chosenCategory = selectedEvent.ticketCategories.find(c => c.id === selectedTicketCat);
    if (!chosenCategory) return;

    const totalAmount = chosenCategory.price * ticketQty;
    const finalAmount = totalAmount + (5 * ticketQty); // including platform fee

    const finalizeBooking = () => {
      const grossAmount = chosenCategory.price * ticketQty;
      const platformFee = 5 * ticketQty; 
      const gatewayFee = chosenCategory.price > 0 ? Number((grossAmount * 0.02).toFixed(2)) : 0;
      const netAmount = Number((grossAmount - platformFee - gatewayFee).toFixed(2));

      const orderId = "ord_" + Math.floor(100000 + Math.random() * 900000);
      const newOrder: Order = {
        id: orderId,
        eventId: selectedEvent.id,
        buyerName: attendeeName,
        buyerEmail: attendeeEmail,
        buyerPhone: attendeePhone,
        paymentStatus: "paid",
        grossAmount,
        platformFee,
        gatewayFee,
        netAmount,
        paymentMethod: "online",
        created_at: new Date().toISOString()
      };

      const passIdCode = "GP-" + Math.floor(1000 + Math.random() * 9000) + "-VX";
      const qrToken = "TKT_" + selectedEvent.id.toUpperCase() + "_" + chosenCategory.name.toUpperCase().replace(/\s+/g, "_") + "_" + Math.floor(100 + Math.random() * 900) + "_" + orderId;

      const newTicket: Ticket = {
        id: "tkt_" + Date.now() + "_" + Math.floor(10 + Math.random() * 90),
        eventId: selectedEvent.id,
        orderId: orderId,
        categoryName: chosenCategory.name,
        price: chosenCategory.price,
        attendeeName,
        attendeePhone,
        attendeeEmail,
        qrToken,
        status: TicketStatus.ISSUED,
        issuedAt: new Date().toISOString()
      };

      onBookTicket(newOrder, newTicket);
      setLastGeneratedTicketCode(passIdCode);
      setLastBookedTicket({
        qrToken,
        attendeeName,
        categoryName: chosenCategory.name,
        price: chosenCategory.price,
        orderId,
        eventTitle: selectedEvent.title,
        eventVenue: selectedEvent.venue,
        eventDate: new Date(selectedEvent.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        ticketId: newTicket.id
      });
      setIsCheckoutSuccess(true);
      setTicketQty(1);
      triggerToast("Ticket successfully generated!");
    };

    if (totalAmount === 0) {
      finalizeBooking();
      return;
    }

    if ((window as any).Razorpay) {
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_TFruYncZJ3Xznc",
        amount: finalAmount * 100, // in paisa
        currency: "INR",
        name: "GATEPASS",
        description: `Access Pass for ${selectedEvent.title}`,
        image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=80&auto=format&fit=crop&q=80",
        handler: function (response: any) {
          triggerToast(`Payment successful! ID: ${response.razorpay_payment_id}`);
          finalizeBooking();
        },
        prefill: {
          name: attendeeName,
          email: attendeeEmail,
          contact: attendeePhone
        },
        theme: {
          color: "#106b47"
        }
      };
      
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } else {
      triggerToast("Razorpay SDK offline. Simulating payment success...");
      setTimeout(() => {
        finalizeBooking();
      }, 1200);
    }
  };

  // Curated events for horizontal sections
  const rockEnSeine = events.find(e => e.id === "ev4") || events[0];
  const weLoveGreen = events.find(e => e.id === "ev5") || events[1];
  const afterlifeSpotlight = events.find(e => e.id === "ev6") || events[2];

  // Welcome greeting logic based on Paris local time or device local time
  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex flex-col gap-6 font-sans bg-[#050509] text-white p-6 rounded-3xl min-h-screen border border-neutral-900 shadow-2xl relative overflow-hidden" id="events-explore-panel">
      
      {/* Toast Alert overlay */}
      {showToastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#16161c] text-[#ff2bd6] font-bold text-xs px-5 py-3 rounded-full border border-pink-500/30 flex items-center gap-2 shadow-xl animate-bounce">
          <Sparkles className="w-4 h-4 text-pink-500 animate-pulse" />
          <span>{showToastMessage}</span>
        </div>
      )}

      {/* Dynamic Top Location Bar & Greeting */}
      <div className="flex justify-between items-center bg-neutral-900/40 p-4 rounded-2xl border border-neutral-800/60 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-800 transition-all flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-pink-500" />
          </Link>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-neutral-400">
              <MapPin className="w-4 h-4 text-[#ff2bd6]" />
              <select 
                value={currentLocation} 
                onChange={(e) => {
                  setCurrentLocation(e.target.value);
                  triggerToast(`Switched location node to ${e.target.value}`);
                }}
                className="bg-transparent border-none text-xs font-black uppercase tracking-wider text-neutral-300 focus:outline-none cursor-pointer"
              >
                <option value="Paris">Paris, France</option>
                <option value="Delhi">Delhi, India</option>
                <option value="London">London, UK</option>
                <option value="New York">New York, USA</option>
              </select>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>{getGreeting()} {user.name.split(" ")[0]}</span>
              <span>👋</span>
            </h2>
          </div>
        </div>
        
        {/* Dynamic Global Favorite Counter */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => triggerToast(`You have favorited ${favorites.length} premium festival lineups!`)}
            className="w-10 h-10 rounded-full bg-neutral-800/80 hover:bg-neutral-800 flex items-center justify-center text-white transition-all relative border border-neutral-700/40"
          >
            <Heart className={`w-4 h-4 ${favorites.length > 0 ? "fill-pink-500 text-pink-500" : "text-neutral-300"}`} />
            {favorites.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-pink-500 text-white font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0e0e11]">
                {favorites.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* STUNNING VIDEO HERO SECTION FROM PARTIES PAGE */}
      <section className="relative min-h-[50vh] md:min-h-[60vh] overflow-hidden rounded-2xl px-4 py-16 md:px-8 md:py-24 border border-neutral-800/60 shadow-inner">
        <video
          className="absolute inset-0 h-full w-full object-cover object-center z-0"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src="/boilerroom/aftermovie-hero.mp4" type="video/mp4" />
          <source src="https://assets.mixkit.co/videos/preview/mixkit-party-crowd-at-a-concert-silhouette-4034-large.mp4" type="video/mp4" />
        </video>
        {/* Radial Ambient Glowing Filters */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,43,214,.36),transparent_24%),radial-gradient(circle_at_82%_12%,rgba(31,182,255,.34),transparent_28%),radial-gradient(circle_at_50%_78%,rgba(125,255,60,.18),transparent_26%),linear-gradient(180deg,rgba(5,5,9,.42),rgba(5,5,9,.86)_62%,#050509_100%)] z-10" />
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(115deg,transparent_0%,rgba(255,255,255,.14)_45%,transparent_55%)] z-10" />
        
        {/* Glowing Laser bars */}
        <div className="absolute left-8 top-20 hidden h-40 w-1 rotate-12 rounded-full bg-[#ff2bd6] blur-[2px] md:block animate-pulse z-10" />
        <div className="absolute right-16 top-24 hidden h-48 w-1 -rotate-12 rounded-full bg-[#1fb6ff] blur-[2px] md:block animate-pulse z-10" />

        <div className="relative z-20 mx-auto flex flex-col items-center justify-center text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-100 backdrop-blur-md">
            <Music2 className="h-3.5 w-3.5 text-[#ff2bd6] animate-spin-slow" />
            Nightlife by GatePass
          </div>
          <h1 className="mt-6 text-4xl md:text-7xl font-black uppercase leading-[.85] tracking-tight text-white drop-shadow-[0_0_42px_rgba(255,43,214,.34)]">
            Scan. Enter. <br className="md:hidden" />No chaos.
          </h1>
          <p className="mt-5 max-w-xl text-xs md:text-sm font-semibold text-white/80 leading-relaxed">
            DJ nights, club drops, VIP tables, afterparties, and QR entry that keeps the door moving offline or online.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                setSelectedCategory("Concert");
                document.getElementById("explore-all-section")?.scrollIntoView({ behavior: "smooth" });
                triggerToast("Filtering tonight's concert lineups ⚡");
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#ff2bd6] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_0_44px_rgba(255,43,214,.38)] transition-transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Find a party
            </button>
            <button
              onClick={() => {
                setIsAttendeeScannerOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-white/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-md transition-transform hover:-translate-y-0.5 active:scale-95 cursor-pointer hover:bg-white/15"
            >
              <QrCode className="h-3.5 w-3.5 text-[#1fb6ff]" />
              My QR
            </button>
          </div>
        </div>
      </section>

      {/* TONIGHT ROOM LIST / CLUB HEAT SECTION */}
      <section className="mx-auto w-full py-4">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between" id="tonight-room-list">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff2bd6]">Tonight&apos;s room list</p>
            <h2 className="mt-1 text-2xl font-black uppercase leading-none md:text-4xl">Club heat, clean gates.</h2>
          </div>
          <button 
            onClick={() => {
              setSelectedCategory("All");
              document.getElementById("explore-all-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200 hover:underline self-start cursor-pointer"
          >
            Explore all <ArrowRight className="h-4.5 w-4.5" />
          </button>
        </div>
        
        {/* Blended 3-column party roster */}
        <div className="grid gap-5 grid-cols-1 md:grid-cols-3">
          {events.filter(e => e.eventType.toLowerCase() === "concert" || e.eventType.toLowerCase() === "college fest").slice(0, 3).map((event) => {
            const lowestPrice = event.ticketCategories.length > 0 ? Math.min(...event.ticketCategories.map(c => c.price)) : 0;
            return (
              <div 
                key={event.id}
                onClick={() => handleOpenEventDetails(event)}
                className="bg-neutral-900/60 rounded-2xl overflow-hidden border border-neutral-800 hover:border-[#ff2bd6]/40 transition-all cursor-pointer group flex flex-col justify-between shadow-lg relative"
              >
                <div className="relative h-44 bg-neutral-800 overflow-hidden">
                  <img 
                    src={event.bannerUrl} 
                    alt={event.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                  />
                  <div className="absolute top-2 left-2 bg-neutral-950/80 backdrop-blur-md text-[8px] text-neutral-300 font-extrabold px-2 py-0.5 rounded-full border border-white/10">
                    {event.eventType}
                  </div>
                  {/* Pulse visual tracker */}
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1fb6ff] animate-ping" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-[#1fb6ff]">Live Gates</span>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <div>
                    <h3 className="text-xs font-black text-white uppercase group-hover:text-[#ff2bd6] transition-colors truncate">
                      {event.title}
                    </h3>
                    <p className="text-[10px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                      {event.description}
                    </p>
                  </div>
                  <div className="flex justify-between items-center pt-2.5 border-t border-neutral-800/60 text-[9px] font-bold text-neutral-400">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#ff2bd6]" />
                      <span className="truncate max-w-[120px]">{event.venue}</span>
                    </div>
                    <span className="text-white font-extrabold bg-[#ff2bd6]/10 px-2 py-0.5 rounded text-[8px]">
                      {lowestPrice === 0 ? "FREE" : `₹${lowestPrice}+`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: TODAY SPOTLIGHT EXPERIENCE (Afterlife) */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-black tracking-widest uppercase text-white flex items-center gap-1.5">
            <span>TODAY SPECIAL</span>
          </h3>
          <span className="text-[10px] font-mono text-pink-500 uppercase font-black tracking-widest bg-pink-500/10 px-2 py-0.5 rounded">
            Theatre Antique Spotlight
          </span>
        </div>

        {/* Large Curated Afterlife Card */}
        <div 
          onClick={() => handleOpenEventDetails(afterlifeSpotlight)}
          className="relative h-64 md:h-80 w-full rounded-2xl overflow-hidden border border-neutral-800 hover:border-neutral-700/80 shadow-lg cursor-pointer group flex flex-col justify-end p-6"
        >
          {/* Base Image */}
          <img 
            src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200&auto=format&fit=crop&q=80" 
            alt="Afterlife Orange" 
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-102 transition-all duration-700"
          />
          {/* Dark Vignette Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />

          {/* Heart & Share Overlay Buttons */}
          <div className="absolute top-4 right-4 flex gap-2">
            <button 
              onClick={(e) => toggleFavorite("ev6", e)}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black text-white hover:scale-110 flex items-center justify-center transition-all border border-neutral-700/30"
            >
              <Heart className={`w-4 h-4 ${favorites.includes("ev6") ? "fill-pink-500 text-pink-500" : "text-white"}`} />
            </button>
            <button 
              onClick={(e) => handleShareEvent(afterlifeSpotlight, e)}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black text-white hover:scale-110 flex items-center justify-center transition-all border border-neutral-700/30"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {/* Details */}
          <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-2 max-w-xl">
              <span className="text-[9px] font-black tracking-widest text-[#ff2bd6] uppercase bg-[#ff2bd6]/10 w-fit px-2 py-0.5 rounded">
                LIVE NATION PRESENT
              </span>
              <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight group-hover:text-[#ff2bd6] transition-colors">
                Afterlife Orange: Tale Of Us &amp; Lineup
              </h2>
              <p className="text-xs text-neutral-300 line-clamp-2">
                An immersive audiovisual showcase by Afterlife Records in the monumental Roman Ruins of Orange. Featuring Tale Of Us, Adriatique, KAS:ST, and Colyn.
              </p>
            </div>

            <div className="flex flex-col gap-1 items-start md:items-end flex-shrink-0">
              <span className="text-xs font-black text-white bg-[#ff2bd6] px-3.5 py-2 rounded-xl uppercase tracking-widest flex items-center gap-1 shadow-md hover:bg-pink-600 transition-all">
                <span>Book Tickets</span>
                <ChevronRight className="w-4 h-4" />
              </span>
              <span className="text-[10px] text-neutral-400 font-bold mt-1">From ₹6,500</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: SEARCH & FILTER THE ALL EXPERIENCES GRID */}
      <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-neutral-800/80">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <h3 className="text-sm font-black tracking-widest uppercase text-white">
            ALL EXPERIENCES
          </h3>

          {/* Sleek Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search genres, artists, colleges..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-10 py-2 text-xs text-neutral-100 font-semibold bg-neutral-900 border border-neutral-800 rounded-xl outline-none focus:border-pink-500/50 transition-all shadow-inner"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-500 text-[9px] font-black hover:underline"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>

        {/* Category filtering pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {filterCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat 
                  ? "bg-pink-500 text-white shadow-lg" 
                  : "bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800"
              }`}
            >
              {cat}s
            </button>
          ))}
        </div>

        {/* Dynamic Cards Grid */}
        {filteredEvents.length === 0 ? (
          <div className="bg-neutral-900/40 rounded-2xl p-12 text-center border border-neutral-800 shadow-inner flex flex-col items-center justify-center gap-3">
            <TicketIcon className="w-8 h-8 text-neutral-600 animate-pulse" />
            <div>
              <h4 className="text-xs font-black text-white uppercase">No experience matching</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">Try modifying your query word or category selection</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredEvents.map(event => {
              const lowestPrice = event.ticketCategories.length > 0
                ? Math.min(...event.ticketCategories.map(c => c.price))
                : 0;
              const isFree = lowestPrice === 0;

              return (
                <div 
                  key={event.id}
                  onClick={() => handleOpenEventDetails(event)}
                  className="bg-neutral-900/40 rounded-2xl overflow-hidden border border-neutral-800/80 hover:border-neutral-700 transition-all duration-300 flex flex-col cursor-pointer group"
                >
                  <div className="h-40 w-full relative overflow-hidden bg-neutral-800">
                    <img 
                      src={event.bannerUrl} 
                      alt={event.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute top-2 left-2 bg-neutral-950/90 text-neutral-300 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                      {event.eventType}
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-lg">
                      {isFree ? "FREE" : `₹${lowestPrice}+`}
                    </div>
                  </div>

                  <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-xs font-black text-white uppercase group-hover:text-pink-500 transition-colors truncate">
                        {event.title}
                      </h4>
                      <p className="text-[10px] text-neutral-400 line-clamp-2 leading-relaxed">
                        {event.description}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-2 border-t border-neutral-800/50 text-[10px] text-neutral-400 font-bold">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                        <span>{new Date(event.startTime).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                        <span className="truncate">{event.venue}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* IMMERSIVE WHITE/GREEN BOOKING MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          {/* Main White Card Container */}
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-neutral-100 flex flex-col p-6 text-neutral-900 font-sans relative">
            
            {/* Close Button */}
            <button 
              onClick={() => {
                setSelectedEvent(null);
                setIsCheckoutSuccess(false);
              }}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center transition-all cursor-pointer z-10"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Event Name Heading */}
            <div className="mb-4 pr-6">
              <span className="text-[9px] font-black tracking-widest text-[#106b47] uppercase bg-emerald-50 px-2.5 py-0.5 rounded-full w-fit">
                {selectedEvent.eventType}
              </span>
              <h3 className="text-lg font-black text-neutral-950 uppercase tracking-tight mt-1 leading-tight">
                {selectedEvent.title}
              </h3>
            </div>

            {/* Booking Details Rows */}
            <div className="flex flex-col gap-3.5 mb-5 text-neutral-800">
              {/* Location Row */}
              <div className="flex items-start gap-3">
                <div className="bg-emerald-50 text-emerald-800 p-2 rounded-xl flex-shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-[#106b47]" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-neutral-900 leading-snug">{selectedEvent.venue}</p>
                  <p className="text-[10px] text-neutral-500 font-medium mt-0.5">Whitefield, Bengaluru</p>
                </div>
              </div>

              {/* Date/Time Row */}
              <div className="flex items-start gap-3">
                <div className="bg-emerald-50 text-emerald-800 p-2 rounded-xl flex-shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4 text-[#106b47]" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-neutral-900 leading-snug">
                    {new Date(selectedEvent.startTime).toLocaleString('en-IN', { 
                      day: 'numeric', 
                      month: 'numeric', 
                      year: 'numeric', 
                      hour: 'numeric', 
                      minute: 'numeric', 
                      second: 'numeric', 
                      hour12: true 
                    })}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-medium mt-0.5">Schedule time (UTC/IST)</p>
                </div>
              </div>

              {/* Verified Badge Row */}
              <div className="flex items-start gap-3">
                <div className="bg-emerald-50 text-emerald-800 p-2 rounded-xl flex-shrink-0 mt-0.5">
                  <Shield className="w-4 h-4 text-[#106b47]" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-neutral-900 leading-snug">GatePass verified inventory</p>
                  <p className="text-[10px] text-neutral-500 font-medium mt-0.5">100% Guaranteed Official Access</p>
                </div>
              </div>
            </div>

            {/* Separator Divider */}
            <div className="border-t border-neutral-100 w-full my-1.5" />

            {/* Selector for Ticket Categories & Quantities if multiple exist and not checked out */}
            {!isCheckoutSuccess && (
              <div className="my-3 flex flex-col gap-2 bg-neutral-50/60 p-3 rounded-2xl border border-neutral-100">
                <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 uppercase">
                  <span>Category</span>
                  <span>Quantity</span>
                </div>
                <div className="flex gap-2">
                  <select 
                    value={selectedTicketCat}
                    onChange={(e) => setSelectedTicketCat(e.target.value)}
                    className="flex-1 p-2 text-xs font-bold text-neutral-800 bg-white border border-neutral-200 rounded-xl outline-none"
                  >
                    {selectedEvent.ticketCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.price === 0 ? "FREE" : `₹${cat.price.toLocaleString()}`})
                      </option>
                    ))}
                  </select>
                  <select 
                    value={ticketQty}
                    onChange={(e) => setTicketQty(Number(e.target.value))}
                    className="w-16 p-2 text-xs font-bold text-neutral-800 bg-white border border-neutral-200 rounded-xl outline-none"
                  >
                    {[1, 2, 3, 4, 5].map(q => (
                      <option key={q} value={q}>{q}x</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Pricing Section */}
            <div className="mb-5 mt-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">FROM</span>
              <span className="text-3xl font-black tracking-tight text-neutral-950">
                ₹{((selectedEvent.ticketCategories.find(c => c.id === selectedTicketCat)?.price || 0) * ticketQty).toLocaleString()}
              </span>
            </div>

            {/* Action Area: Book button / Razorpay / Success state */}
            {!isCheckoutSuccess ? (
              <button 
                onClick={() => handleConfirmBooking()}
                className="w-full py-4 bg-[#106b47] hover:bg-[#0c5337] text-white text-sm font-bold tracking-tight rounded-[20px] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <Sparkles className="w-4 h-4 text-white/90 animate-pulse" />
                <span>Book now</span>
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Success Banner matching screenshot */}
                <div className="bg-[#e8f8f0] border border-emerald-500/10 rounded-[20px] p-3.5 flex items-center gap-2.5 text-[#106b47] font-bold text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                  <span>Booked. Your pass is ready.</span>
                </div>
                
                {/* Button to view/reveal ticket QR */}
                <button 
                  onClick={() => setIsAttendeeScannerOpen(true)}
                  className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider rounded-[16px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-cyan-400" />
                  <span>Show Entry QR Pass</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ATTENDEE PERMANENT QR MODAL */}
      {isAttendeeScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-sm">
            <button 
              onClick={() => setIsAttendeeScannerOpen(false)}
              className="absolute -top-12 right-0 w-8 h-8 rounded-full bg-neutral-900 hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white border border-neutral-800/80 cursor-pointer z-50"
            >
              <X className="w-4 h-4" />
            </button>
            <UniversalQrCard userName={user.name} />
          </div>
        </div>
      )}

    </div>
  );
}
