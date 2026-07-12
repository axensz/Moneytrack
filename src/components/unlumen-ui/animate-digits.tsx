'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';

interface AnimateDigitsProps {
  value: string;
  className?: string;
  digitClassName?: string;
  direction?: 'dynamic' | 'up' | 'down';
}

interface ExitItem {
  id: number;
  char: string;
  exitY: number;
}

let exitId = 0;

function DigitCell({
  char,
  className,
  direction = 'dynamic',
}: {
  char: string;
  className?: string;
  direction?: AnimateDigitsProps['direction'];
}) {
  const [exitQueue, setExitQueue] = useState<ExitItem[]>([]);
  const previousChar = useRef(char);
  const firstRender = useRef(true);
  const spring = { stiffness: 230, damping: 22 };
  const y = useSpring(0, spring);
  const opacity = useSpring(1, spring);
  const scale = useSpring(1, spring);
  const blur = useSpring(0, spring);
  const filter = useTransform(blur, current => `blur(${current}px)`);

  useEffect(() => {
    const previous = previousChar.current;
    previousChar.current = char;

    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (char === previous || !/\d/.test(previous)) return;

    const increasing = direction === 'dynamic'
      ? Number(char) > Number(previous)
      : direction === 'up';
    const enterY = increasing ? 8 : -8;
    const id = exitId++;

    setExitQueue(queue => [...queue, { id, char: previous, exitY: -enterY }].slice(-2));
    y.jump(enterY);
    opacity.jump(0);
    scale.jump(0.96);
    blur.jump(4);
    y.set(0);
    opacity.set(1);
    scale.set(1);
    blur.set(0);
  }, [blur, char, direction, opacity, scale, y]);

  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid place-items-center overflow-visible align-baseline [&>*]:col-start-1 [&>*]:row-start-1 ${className ?? ''}`}
    >
      <AnimatePresence>
        {exitQueue.map(item => (
          <motion.span
            key={item.id}
            initial={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            animate={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', y: item.exitY }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onAnimationComplete={() => {
              setExitQueue(queue => queue.filter(candidate => candidate.id !== item.id));
            }}
          >
            {item.char}
          </motion.span>
        ))}
      </AnimatePresence>
      <motion.span style={{ opacity, scale, filter, y }}>{char}</motion.span>
    </span>
  );
}

/**
 * Adaptado del componente gratuito Animate Digits de Unlumen UI.
 * Mantiene el valor monetario ya formateado por Moneytrack y anima únicamente
 * los dígitos que cambian. Los lectores de pantalla reciben un solo valor y
 * prefers-reduced-motion desactiva por completo el efecto.
 */
export function AnimateDigits({
  value,
  className,
  digitClassName,
  direction = 'dynamic',
}: AnimateDigitsProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span className={`tabular-nums ${className ?? ''}`}>{value}</span>;
  }

  return (
    <span
      className={`inline-flex items-baseline tabular-nums ${className ?? ''}`}
      aria-label={value}
    >
      {value.split('').map((char, index) => (
        /\d/.test(char) ? (
          <DigitCell
            key={index}
            char={char}
            className={digitClassName}
            direction={direction}
          />
        ) : (
          <span key={index} aria-hidden="true" className={digitClassName}>{char}</span>
        )
      ))}
    </span>
  );
}

export type { AnimateDigitsProps };
