import React from 'react';
import { motion } from 'framer-motion';

interface AmbientBackgroundProps {
  imageSrc: string;
  className?: string;
}

const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ 
  imageSrc,
  className = '',
}) => {
  return (
    <div className={`fixed inset-0 -z-10 overflow-hidden ${className}`}>
      {/* Main ambient image */}
      <motion.img
        key={imageSrc}
        src={imageSrc}
        alt=""
        className="ambient-background"
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: 1, scale: 1.5 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      {/* Ambient overlay with vignette */}
      <div className="ambient-overlay" />

      {/* Additional color overlay for mood */}
      <div 
        className="absolute inset-0 mix-blend-overlay opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 30% 30%, rgba(100, 100, 255, 0.3) 0%, transparent 50%)',
        }}
      />

      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Subtle animated gradient orbs */}
      <motion.div
        className="absolute w-[800px] h-[800px] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
          left: '10%',
          top: '20%',
        }}
        animate={{
          x: [0, 100, 0],
          y: [0, -50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-15"
        style={{
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
          right: '5%',
          bottom: '10%',
        }}
        animate={{
          x: [0, -80, 0],
          y: [0, 60, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
};

export default AmbientBackground;
