import type { ButtonHTMLAttributes } from "react";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function AppButton({
  className = "",
  type = "button",
  ...props
}: AppButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={className ? `app-button ${className}` : "app-button"}
    />
  );
}
