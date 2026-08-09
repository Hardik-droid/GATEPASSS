import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import UniversalQrCard from "./UniversalQrCard";
import KineticHeading from "../components/ui/KineticHeading";
import { formatLocation } from "../location";
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

import { isEventExpired } from "../eventUtils";

interface AttendeeEventsListProps {
  events: EventItem[];
  user: UserProfile;
  onBookTicket: (order: Order, ticket: Ticket) => void;
}

export default function AttendeeEventsList({ events, user, onBookTicket }: AttendeeEventsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [_nowTick, setNowTick] = useState(Date.now());

  // Periodic 30-second tick so events that expire while the user is viewing the page auto-hide smoothly.
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Custom states matching Shotgun visual uploads
  const [currentLocation, setCurrentLocation] = useState("Detecting location…");
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

  // `user` starts as placeholder mock data and is replaced once Neon Auth
  // resolves the real signed-in identity. The useState() initializers above
  // only capture that value once, at mount — if this page mounted before
  // auth resolved, the checkout form (and every ticket booked from it) would
  // stay stuck showing the placeholder name/email/phone. Re-sync when the
  // real identity arrives.
  useEffect(() => {
    setAttendeeName(user.name);
    setAttendeeEmail(user.email);
    setAttendeePhone(user.phone);
  }, [user.name, user.email, user.phone]);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "upi" | "cash">("online");
  const [isCheckoutSuccess, setIsCheckoutSuccess] = useState(false);
  const [lastGeneratedTicketCode, setLastGeneratedTicketCode] = useState("");
  const [lastBookedTicket, setLastBookedTicket] = useState<{qrToken: string; attendeeName: string; categoryName: string; price: number; orderId: string; eventTitle: string; eventVenue: string; eventDate: string; ticketId: string} | null>(null);
  const ticketCardRef = useRef<HTMLDivElement>(null);

  const triggerToast = (msg: string) => {
    setShowToastMessage(msg);
    setTimeout(() => setShowToastMessage(null), 3000);
  };

  useEffect(() => {
    const cachedLocation = sessionStorage.getItem("gatepass_detected_location");
    if (cachedLocation) {
      setCurrentLocation(cachedLocation);
      return;
    }

    if (!navigator.geolocation) {
      setCurrentLocation("Location unavailable");
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const endpoint = import.meta.env.VITE_GEOCODING_URL
            || "https://nominatim.openstreetmap.org/reverse";
          const url = new URL(endpoint);
          url.searchParams.set("format", "jsonv2");
          url.searchParams.set("lat", String(coords.latitude));
          url.searchParams.set("lon", String(coords.longitude));
          url.searchParams.set("zoom", "10");
          url.searchParams.set("addressdetails", "1");

          const response = await fetch(url);
          if (!response.ok) throw new Error(`Location lookup failed: ${response.status}`);
          const location = formatLocation(await response.json());
          if (!location) throw new Error("Location lookup returned no city");
          if (cancelled) return;

          sessionStorage.setItem("gatepass_detected_location", location);
          setCurrentLocation(location);
        } catch {
          if (!cancelled) setCurrentLocation("Location unavailable");
        }
      },
      () => {
        if (!cancelled) setCurrentLocation("Location unavailable");
      },
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 10_000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

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

  // Filtered Events (Active/non-expired events only for Public Events listing)
  const filteredEvents = events.filter(event => {
    if (isEventExpired(event.endTime)) return false;

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

  const getEventTicketCategories = (event: EventItem | null) => {
    if (!event) return [];
    if (event.ticketCategories && event.ticketCategories.length > 0) {
      return event.ticketCategories;
    }
    return [
      {
        id: `cat_${event.id}_0`,
        eventId: event.id,
        name: "General Pass",
        description: "General Access Tier",
        price: 150,
        capacity: event.capacity || 500,
        soldCount: 0,
      },
      {
        id: `cat_${event.id}_1`,
        eventId: event.id,
        name: "VIP Pass",
        description: "VIP Access Tier",
        price: 499,
        capacity: 100,
        soldCount: 0,
      },
    ];
  };

  const handleOpenEventDetails = (event: EventItem) => {
    setSelectedEvent(event);
    setIsBooking(false);
    setIsCheckoutSuccess(false);
    const cats = getEventTicketCategories(event);
    if (cats.length > 0) {
      setSelectedTicketCat(cats[0].id);
    }
  };

  const handleConfirmBooking = (e?: React.FormEvent | React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedEvent) return;

    const cats = getEventTicketCategories(selectedEvent);
    const chosenCategory = cats.find(c => c.id === selectedTicketCat) || cats[0];
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

  // Welcome greeting logic based on device local time
  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen w-full bg-[#F3EEEB] font-sans text-[#171719] antialiased" id="events-explore-panel">
      
      {/* Toast Alert overlay */}
      {showToastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[#171719] text-[#F8F5F2] font-semibold text-xs px-5 py-3 rounded-2xl border border-black/10 flex items-center gap-2 shadow-2xl animate-bounce">
          <Sparkles className="w-4 h-4 text-[#9A734A]" />
          <span>{showToastMessage}</span>
        </div>
      )}

      {/* Dynamic Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#F8F5F2]/90 px-4 py-3.5 shadow-sm backdrop-blur-md sm:px-6 md:px-10">
        <div className="max-w-[1480px] mx-auto flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link to="/" className="p-2.5 rounded-xl bg-[#E8E1DD] hover:bg-[#D0C4BD] text-[#171719] border border-black/10 transition-all flex items-center justify-center cursor-pointer">
              <ArrowLeft className="w-4 h-4 text-[#42566E]" />
            </Link>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5 text-[#625B57]">
                <MapPin className="w-3.5 h-3.5 text-[#42566E]" />
                <span aria-live="polite" className="truncate text-xs font-semibold text-[#171719]">
                  {currentLocation}
                </span>
              </div>
              <h2 className="truncate text-sm sm:text-base font-bold tracking-tight text-[#171719]">
                <span>Events &amp; Concerts</span>
              </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => triggerToast(`You have favorited ${favorites.length} lineup items.`)}
              className="w-9 h-9 rounded-xl bg-[#E8E1DD] hover:bg-[#D0C4BD] flex items-center justify-center text-[#171719] transition-all relative border border-black/10 cursor-pointer"
              title="Favorites"
            >
              <Heart className={`w-4 h-4 ${favorites.length > 0 ? "fill-[#A34F4C] text-[#A34F4C]" : "text-[#625B57]"}`} />
              {favorites.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#A34F4C] text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                  {favorites.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsAttendeeScannerOpen(true)}
              className="py-2 px-3.5 bg-[#42566E] hover:bg-[#58708C] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Show My Pass</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-8 md:py-12 flex flex-col gap-10 md:gap-12">
        
        {/* Page Header */}
        <section className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#42566E] uppercase tracking-wider">
            <Globe className="w-3.5 h-3.5 text-[#42566E]" />
            <span>Public Event Explorer</span>
          </div>
          <KineticHeading
            accent="Events."
            primary="Manage live events & access."
            size="lg"
            lightMode={true}
          />
          <p className="text-sm text-[#625B57] max-w-2xl leading-relaxed mt-1">
            Explore verified festival lineups, club drops, and instant QR entry passes.
          </p>
        </section>

        {/* Featured Spotlight Card */}
        {afterlifeSpotlight && (
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#938C87]">Featured Spotlight</h3>
            
            <div 
              onClick={() => handleOpenEventDetails(afterlifeSpotlight)}
              className="bg-[#F8F5F2] rounded-2xl border border-black/10 shadow-[0_8px_24px_rgba(49,40,36,0.04)] overflow-hidden flex flex-col md:flex-row hover:border-[#42566E]/40 transition-all duration-300 cursor-pointer group"
            >
              <div className="relative md:w-1/2 h-64 md:h-80 overflow-hidden bg-[#E8E1DD]">
                <img 
                  src={afterlifeSpotlight.bannerUrl || "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200&auto=format&fit=crop&q=80"} 
                  alt={afterlifeSpotlight.title} 
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                />
                <div className="absolute top-4 left-4 bg-[#171719]/80 backdrop-blur-md text-[#F8F5F2] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-lg border border-white/10">
                  Featured Experience
                </div>
              </div>

              <div className="p-6 md:p-8 flex flex-col justify-between md:w-1/2 gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-[#42566E] uppercase bg-[#42566E]/10 px-2.5 py-1 rounded-md">
                      Spotlight Selection
                    </span>
                    <button 
                      onClick={(e) => toggleFavorite("ev6", e)}
                      className="p-2 rounded-xl bg-[#E8E1DD] hover:bg-[#D0C4BD] text-[#171719] transition-all cursor-pointer"
                    >
                      <Heart className={`w-4 h-4 ${favorites.includes("ev6") ? "fill-[#A34F4C] text-[#A34F4C]" : "text-[#625B57]"}`} />
                    </button>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-[#171719] tracking-tight group-hover:text-[#42566E] transition-colors mt-1">
                    {afterlifeSpotlight.title}
                  </h2>
                  <p className="text-xs text-[#625B57] line-clamp-3 leading-relaxed mt-1">
                    {afterlifeSpotlight.description}
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-black/10">
                  <div className="flex items-center gap-4 text-xs text-[#625B57] font-medium">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#42566E]" />
                      <span>{afterlifeSpotlight.venue}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#42566E]" />
                      <span>{new Date(afterlifeSpotlight.startTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <span className="text-[10px] font-bold text-[#938C87] uppercase block">Starting Tier</span>
                      <span className="text-base font-extrabold text-[#171719]">
                        {afterlifeSpotlight.ticketCategories.length > 0 
                          ? `₹${Math.min(...afterlifeSpotlight.ticketCategories.map(c => c.price)).toLocaleString()}` 
                          : "₹6,500"}
                      </span>
                    </div>
                    <button className="px-5 py-2.5 bg-[#171719] group-hover:bg-[#42566E] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-sm">
                      <span>Book Pass</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* All Events & Search Filters Section */}
        <section className="flex flex-col gap-0" id="explore-all-section">
          {/* Header & Search Bar Row */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h3 className="text-2xl sm:text-3xl font-black text-[#171719] tracking-[-0.035em] leading-tight uppercase">
                UPCOMING EVENTS &amp; LINEUPS
              </h3>
              <p className="text-sm font-normal text-[#746D68] mt-1.5">
                Discover events by category, venue or artist.
              </p>
            </div>

            {/* Compact Search Input */}
            <div className="relative w-full sm:w-[380px] flex-shrink-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#938C87]" />
              <input 
                type="text" 
                placeholder="Search events..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 pl-9 pr-10 text-xs font-medium text-[#171719] placeholder-[#938C87] bg-[#F8F5F2] border border-black/10 rounded-xl outline-none focus:border-[#42566E] focus:ring-2 focus:ring-[#42566E]/10 transition-all"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#42566E] text-[10px] font-bold hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Compact Category Filter Chips */}
          <div className="flex items-center gap-2 flex-wrap mt-6 overflow-x-auto scrollbar-none">
            {filterCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`h-[38px] px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat 
                    ? "bg-[#171719] text-[#F8F5F2] shadow-sm" 
                    : "bg-[#F8F5F2] hover:bg-[#EEE8E4] text-[#625B57] border border-black/10"
                }`}
              >
                {cat === "All" ? "ALL" : cat === "Concert" ? "CONCERTS" : cat === "College Fest" ? "COLLEGE FESTS" : cat === "Marathon" ? "MARATHONS" : "WORKSHOPS"}
              </button>
            ))}
          </div>

          {/* Subtle Divider Line */}
          <div className="w-full border-b border-black/10 mt-6 mb-7" />

          {/* Events Grid */}
          {filteredEvents.length === 0 ? (
            <div className="bg-[#F8F5F2] rounded-2xl p-12 text-center border border-black/10 flex flex-col items-center justify-center gap-3">
              <TicketIcon className="w-8 h-8 text-[#938C87]" />
              <div>
                <h4 className="text-sm font-bold text-[#171719]">No matching events found</h4>
                <p className="text-xs text-[#625B57] mt-1">Try modifying your query word or selecting another category</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map(event => {
                const lowestPrice = event.ticketCategories.length > 0
                  ? Math.min(...event.ticketCategories.map(c => c.price))
                  : 0;
                const isFree = lowestPrice === 0;

                return (
                  <div 
                    key={event.id}
                    onClick={() => handleOpenEventDetails(event)}
                    className="bg-[#F8F5F2] rounded-2xl border border-black/10 shadow-[0_8px_24px_rgba(49,40,36,0.04)] hover:shadow-[0_12px_32px_rgba(49,40,36,0.08)] hover:-translate-y-0.5 hover:border-[#42566E]/40 transition-all duration-200 overflow-hidden flex flex-col justify-between cursor-pointer group"
                  >
                    <div className="h-44 w-full relative overflow-hidden bg-[#E8E1DD]">
                      <img 
                        src={event.bannerUrl} 
                        alt={event.title} 
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 bg-[#F8F5F2]/90 backdrop-blur-md text-[#42566E] text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border border-black/10">
                        {event.eventType}
                      </div>
                      <div className="absolute bottom-3 right-3 bg-[#171719]/90 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                        {isFree ? "FREE" : `₹${lowestPrice}+`}
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-1 justify-between gap-4">
                      <div className="flex flex-col gap-1.5">
                        <h4 className="text-base font-bold text-[#171719] group-hover:text-[#42566E] transition-colors truncate">
                          {event.title}
                        </h4>
                        <p className="text-xs text-[#625B57] line-clamp-2 leading-relaxed">
                          {event.description}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 pt-3 border-t border-black/10 text-xs text-[#625B57]">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[#42566E] flex-shrink-0" />
                          <span>{new Date(event.startTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[#42566E] flex-shrink-0" />
                          <span className="truncate">{event.venue}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Booking Checkout Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#F8F5F2] w-full max-w-md rounded-3xl p-6 border border-black/10 shadow-2xl flex flex-col gap-5 text-[#171719] relative">
            
            {/* Close Button */}
            <button 
              onClick={() => {
                setSelectedEvent(null);
                setIsCheckoutSuccess(false);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#E8E1DD] hover:bg-[#D0C4BD] text-[#171719] flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Event Name Heading */}
            <div className="pr-6">
              <span className="text-[10px] font-bold tracking-wider text-[#42566E] uppercase bg-[#42566E]/10 px-2.5 py-0.5 rounded-md">
                {selectedEvent.eventType}
              </span>
              <h3 className="text-xl font-extrabold text-[#171719] tracking-tight mt-1 leading-tight">
                {selectedEvent.title}
              </h3>
            </div>

            {/* Booking Details Rows */}
            <div className="flex flex-col gap-3 text-xs text-[#625B57]">
              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-black/10">
                <MapPin className="w-4 h-4 text-[#42566E] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#171719]">{selectedEvent.venue}</p>
                  <p className="text-[10px] text-[#938C87]">Verified venue location</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-black/10">
                <Calendar className="w-4 h-4 text-[#42566E] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#171719]">
                    {new Date(selectedEvent.startTime).toLocaleString('en-IN', { 
                      day: 'numeric', 
                      month: 'short', 
                      year: 'numeric', 
                      hour: 'numeric', 
                      minute: 'numeric', 
                      hour12: true 
                    })}
                  </p>
                  <p className="text-[10px] text-[#938C87]">Schedule timestamp</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-[#55765F]/10 rounded-xl border border-[#55765F]/20 text-[#55765F]">
                <Shield className="w-4 h-4 text-[#55765F] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">GatePass verified inventory</p>
                  <p className="text-[10px]">100% Guaranteed Access Pass</p>
                </div>
              </div>
            </div>

            {/* Ticket Categories & Quantities */}
            {!isCheckoutSuccess && (() => {
              const catsToRender = getEventTicketCategories(selectedEvent);
              const activeCat = catsToRender.find(c => c.id === selectedTicketCat) || catsToRender[0];
              return (
                <div className="flex flex-col gap-3 border-t border-black/10 pt-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-[#171719]">Pass Tier &amp; Quantity</label>
                    <div className="flex gap-2">
                      <select 
                        value={selectedTicketCat || activeCat?.id}
                        onChange={(e) => setSelectedTicketCat(e.target.value)}
                        className="flex-1 p-2.5 text-xs font-bold text-[#171719] bg-white border border-black/10 rounded-xl outline-none focus:border-[#42566E]"
                      >
                        {catsToRender.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name} ({cat.price === 0 ? "FREE" : `₹${cat.price.toLocaleString()}`})
                          </option>
                        ))}
                      </select>
                      <select 
                        value={ticketQty}
                        onChange={(e) => setTicketQty(Number(e.target.value))}
                        className="w-20 p-2.5 text-xs font-bold text-[#171719] bg-white border border-black/10 rounded-xl outline-none focus:border-[#42566E]"
                      >
                        {[1, 2, 3, 4, 5].map(q => (
                          <option key={q} value={q}>{q}x</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-[#625B57]">Total Payable Amount</span>
                    <span className="text-2xl font-extrabold text-[#171719]">
                      ₹{((activeCat?.price || 0) * ticketQty).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Action Buttons */}
            {!isCheckoutSuccess ? (
              <button 
                onClick={() => handleConfirmBooking()}
                className="w-full py-3.5 bg-[#42566E] hover:bg-[#58708C] text-white text-xs font-bold uppercase tracking-wider rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-white" />
                <span>Confirm &amp; Book Pass</span>
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="bg-[#55765F]/10 border border-[#55765F]/20 rounded-2xl p-4 flex items-center gap-3 text-[#55765F] font-bold text-xs">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span>Pass booked successfully! Your entry pass is ready.</span>
                </div>
                
                <button 
                  onClick={() => setIsAttendeeScannerOpen(true)}
                  className="w-full py-3 bg-[#171719] hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-[#42566E]" />
                  <span>Show Entry QR Pass</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ATTENDEE PERMANENT QR MODAL */}
      {isAttendeeScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm">
            <button 
              onClick={() => setIsAttendeeScannerOpen(false)}
              className="absolute -top-12 right-0 w-8 h-8 rounded-full bg-[#F8F5F2] text-[#171719] flex items-center justify-center border border-black/10 cursor-pointer z-50"
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
