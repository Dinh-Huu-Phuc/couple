"use client";

import {
  MotionConfig,
  motion,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, type AriaRole, type ReactNode } from "react";

type RevealPreset = "fadeUp" | "slideLeft" | "slideRight" | "softScale";
type RevealTag = "article" | "div";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  preset?: RevealPreset;
  as?: RevealTag;
  role?: AriaRole;
  ariaLabel?: string;
};

const revealPresets = {
  fadeUp: { opacity: 0, y: 22 },
  slideLeft: { opacity: 0, x: -30 },
  slideRight: { opacity: 0, x: 30 },
  softScale: { opacity: 0, scale: 0.975 },
} satisfies Record<RevealPreset, object>;

const revealEase = [0.22, 1, 0.36, 1] as const;

export function LandingMotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function Reveal({
  children,
  className,
  delay = 0,
  preset = "fadeUp",
  as = "div",
  role,
  ariaLabel,
}: RevealProps) {
  const Component = as === "article" ? motion.article : motion.div;

  return (
    <Component
      className={className}
      role={role}
      aria-label={ariaLabel}
      initial={revealPresets[preset]}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.22, margin: "0px 0px -6% 0px" }}
      transition={{
        duration: 0.56,
        delay,
        ease: revealEase,
      }}
    >
      {children}
    </Component>
  );
}

type ParallaxPetalProps = {
  className: string;
  distance?: number;
  rotate: number;
  scale?: number;
};

export function ParallaxPetal({
  className,
  distance = 16,
  rotate,
  scale = 1,
}: ParallaxPetalProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-distance, distance]);

  return (
    <motion.span
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{
        y,
        rotate,
        scale,
      }}
    />
  );
}
