"use client";

// A password input with an eye button to show or hide what was typed, so a
// typo can be seen before submitting. Use for every password field.

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

export default function PasswordInput({
   className = "",
   ...props
}: PasswordInputProps) {
   const [visible, setVisible] = useState(false);
   const label = visible ? "Hide password" : "Show password";
   const Icon = visible ? EyeOff : Eye;

   return (
      <span className="relative block w-full">
         <input
            {...props}
            type={visible ? "text" : "password"}
            className={`input w-full pr-10 ${className}`}
         />
         <button
            // Not "submit": inside a form, a plain button would send it.
            type="button"
            onClick={() => setVisible((v) => !v)}
            // Keeps the cursor in the input while toggling.
            onMouseDown={(e) => e.preventDefault()}
            aria-pressed={visible}
            title={label}
            className="  absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-fg focus-visible:text-accent focus-visible:outline-none">
            <span className="sr-only">{label}</span>
            <Icon className="size-4" aria-hidden />
         </button>
      </span>
   );
}
