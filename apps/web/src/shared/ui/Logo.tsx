import React from "react";
import { BRANDING } from "../config/branding";

type LogoProps = {
  size?: number;
  withText?: boolean;
  className?: string;
};

export const Logo: React.FC<LogoProps> = ({ size = 36, withText = false, className = "" }) => {
  return (
    <div className={`group inline-flex max-w-full items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt={`${BRANDING.productName} logo`}
        width={size}
        height={size}
        className="shrink-0 rounded-xl transition-all duration-300 ease-out group-hover:scale-105 group-hover:shadow-[0_10px_28px_-12px_rgba(79,70,229,0.55)]"
      />
      {withText ? (
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-900">
            {BRANDING.productName}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-slate-500">{BRANDING.clinicName}</p>
        </div>
      ) : null}
    </div>
  );
};

