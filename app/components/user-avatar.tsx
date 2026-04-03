import { useState } from "react";
import { cn } from "~/lib/utils";

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={cn("size-8 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${name}'s avatar`}
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary",
        className
      )}
    >
      {initials}
    </div>
  );
}
