"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

interface GatePassEvent {
  id: number;
  passNumber: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  passType: string;
  image: string;
  href: string;
  objectPosition?: string;
}

const gatePassEvents: GatePassEvent[] = [
  {
    id: 1,
    passNumber: "01",
    title: "Aura Cultural Fest",
    date: "25 July 2026",
    time: "6:00 PM",
    venue: "Main Auditorium",
    passType: "VIP Gate Pass",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    href: "/gatepass/event-one",
    objectPosition: "center"
  },
  {
    id: 2,
    passNumber: "02",
    title: "Afterlife Audio Odyssey",
    date: "27 July 2026",
    time: "7:00 PM",
    venue: "Grand Hall",
    passType: "Premium Gate Pass",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&auto=format&fit=crop&q=80",
    href: "/gatepass/event-two",
    objectPosition: "center"
  },
  {
    id: 3,
    passNumber: "03",
    title: "Greenfield Marathon",
    date: "30 July 2026",
    time: "5:30 PM",
    venue: "Open Arena",
    passType: "General Gate Pass",
    image: "https://images.unsplash.com/photo-1502224562085-639556652f33?w=800&auto=format&fit=crop&q=80",
    href: "/gatepass/event-three",
    objectPosition: "center"
  }
];

interface HomeUpdatesProps {
  onViewEvent: () => void;
}

export default function HomeUpdates({ onViewEvent }: HomeUpdatesProps) {
  const reduceMotion = useReducedMotion();
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <section 
      className="relative w-full h-[calc(100vh-124px)] md:h-[calc(100vh-73px)] flex items-center justify-center overflow-hidden bg-[#050505] px-4 py-6 md:px-10"
      aria-labelledby="gatepass-events-title"
    >
      <h2 id="gatepass-events-title" className="sr-only">Latest GatePass events and offers</h2>

      <motion.div
        className="hide-scrollbar flex h-[420px] w-[92vw] max-w-[1240px] snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain md:h-[430px] md:overflow-visible"
        onMouseLeave={() => setActiveCard(null)}
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            setActiveCard(null);
          }
        }}
      >
        {gatePassEvents.map((item, index) => {
          const active = activeCard === item.id;
          
          return (
            <motion.article
              key={item.id}
              tabIndex={0}
              aria-label={`${item.title}. ${item.passType}. Press Enter to open.`}
              animate={{ flexGrow: active ? 2.6 : 1 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.85, ease }}
              onMouseEnter={() => setActiveCard(item.id)}
              onFocus={() => setActiveCard(item.id)}
              onClick={() => setActiveCard(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onViewEvent();
              }}
              className="relative h-[420px] min-w-[82vw] flex-none snap-center cursor-pointer overflow-hidden rounded-[12px] bg-neutral-900 outline-none ring-offset-2 ring-offset-black focus-visible:ring-2 focus-visible:ring-white max-md:!grow-0 max-md:!shrink-0 max-md:!basis-[82vw] md:h-[430px] md:min-w-0 md:basis-0 md:flex"
            >
              {/* Background Image with Zoom & Blur */}
              <motion.img
                src={item.image}
                alt={`${item.title} at ${item.venue}`}
                loading={index === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: item.objectPosition || "center" }}
                animate={{
                  scale: active ? 1.06 : 1,
                  filter: active
                    ? "blur(2.5px) brightness(0.55)"
                    : "blur(0px) brightness(1)",
                }}
                transition={{ duration: reduceMotion ? 0.01 : 0.9, ease }}
              />

              {/* Dark Overlay when active */}
              <motion.div 
                className="absolute inset-0 bg-black/40" 
                animate={{ opacity: active ? 1 : 0 }} 
                transition={{ duration: reduceMotion ? 0.01 : 0.5 }} 
              />

              {/* Bottom Vignette/Gradient */}
              <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black via-black/85 to-transparent" />

              {/* Card number badge */}
              <span className="absolute right-3 top-3 z-10 rounded-sm bg-black px-2 py-1 text-[9px] font-black tracking-widest text-white">
                {item.passNumber}
              </span>

              {/* Default Title (Fades out when active) */}
              <motion.h3
                animate={{ opacity: active ? 0 : 1, y: active ? 8 : 0 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.32, ease }}
                className="absolute inset-x-4 bottom-6 z-10 text-center text-[15px] font-semibold text-white tracking-wide"
              >
                {item.title}
              </motion.h3>

              {/* Centered Active Content Information Block */}
              <div className="pointer-events-none absolute inset-x-4 top-[60%] z-20 -translate-y-1/2 text-center text-white">
                <motion.div
                  animate={{ 
                    opacity: active ? 1 : 0, 
                    y: active ? 0 : 12 
                  }}
                  transition={{ 
                    duration: reduceMotion ? 0.01 : 0.45, 
                    delay: active && !reduceMotion ? 0.12 : 0, 
                    ease 
                  }}
                  className="flex flex-col items-center"
                >
                  <h3 className="text-[18px] font-semibold leading-tight tracking-wide">{item.title}</h3>
                  <div className="mt-2 space-y-0.5 text-[12px] leading-snug text-white/80 font-medium">
                    <p>{item.date}</p>
                    <p>{item.time}</p>
                    <p>{item.venue}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mt-1">
                      {item.passType}
                    </p>
                  </div>
                  
                  {/* Circular Arrow Button */}
                  <button
                    type="button"
                    tabIndex={active ? 0 : -1}
                    aria-label={`Open ${item.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewEvent();
                    }}
                    className="pointer-events-auto mt-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-white transition-colors duration-200 hover:bg-white hover:text-black focus-visible:bg-white focus-visible:text-black focus-visible:outline-none"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              </div>
            </motion.article>
          );
        })}
      </motion.div>
    </section>
  );
}
