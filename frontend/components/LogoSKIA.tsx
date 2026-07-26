'use client';
import React from 'react';

interface LogoSKIAProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function LogoSKIA({ size = 'md', showText = true }: LogoSKIAProps) {
  // Dimensiones del icono por tamaño
  const iconSizes = { sm: 22, md: 26, lg: 32 };
  const px = iconSizes[size];

  // Cuando está dentro del badge indigo del sidebar, se muestra blanco
  // El contenedor padre ya tiene el gradiente indigo aplicado
  return (
    <img
      src="/logo-skia.png"
      alt="SKIA"
      style={{
        width: px,
        height: px,
        objectFit: 'contain',
        filter: 'brightness(0) invert(1)',
        display: 'block',
      }}
    />
  );
}
