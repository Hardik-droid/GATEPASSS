import React from "react";

interface KineticHeadingProps {
  accent?: string;
  primary?: string;
  tag?: "h1" | "h2" | "h3";
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center" | "right";
  className?: string;
  delay?: number;
  lightMode?: boolean;
}

export const KineticHeading: React.FC<KineticHeadingProps> = ({
  accent,
  primary,
  tag = "h1",
  size = "lg",
  align = "left",
  className = "",
  delay = 0,
  lightMode = false,
}) => {
  const Tag = tag;

  const sizeClasses = {
    sm: "text-lg sm:text-xl",
    md: "text-2xl sm:text-3xl",
    lg: "text-3xl sm:text-4xl lg:text-5xl",
    xl: "text-4xl sm:text-5xl lg:text-6xl",
  }[size];

  const alignClasses = {
    left: "text-left items-start",
    center: "text-center items-center",
    right: "text-right items-end",
  }[align];

  return (
    <Tag
      className={`font-sans tracking-tight font-black uppercase flex flex-col gap-1 leading-none ${sizeClasses} ${alignClasses} ${className}`}
    >
      {accent && (
        <span
          style={{
            animationDelay: `${delay}ms`,
            willChange: "transform, opacity",
          }}
          className={`inline-block font-serif italic font-normal tracking-normal text-emerald-500 dark:text-emerald-400 animate-kinetic-accent`}
        >
          {accent}
        </span>
      )}
      {primary && (
        <span
          style={{
            animationDelay: `${delay + 90}ms`,
            willChange: "transform, opacity",
          }}
          className={`inline-block font-black uppercase ${
            lightMode ? "text-neutral-900" : "text-white dark:text-white"
          } animate-kinetic-primary`}
        >
          {primary}
        </span>
      )}
    </Tag>
  );
};

export default KineticHeading;
