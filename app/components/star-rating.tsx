import { useState } from "react";
import { Star } from "lucide-react";

export function StarRatingDisplay({
  average,
  count,
}: {
  average: number | null;
  count: number;
}) {
  const hasRatings = average !== null && count > 0;

  const getStarFill = (starIndex: number): "full" | "half" | "empty" => {
    if (!hasRatings) return "empty";
    const rounded = Math.round(average * 2) / 2;
    if (starIndex <= Math.floor(rounded)) return "full";
    if (starIndex === Math.ceil(rounded) && rounded % 1 !== 0) return "half";
    return "empty";
  };

  const ariaLabel = hasRatings
    ? `Rated ${average.toFixed(1)} out of 5 stars (${count} ${count === 1 ? "rating" : "ratings"})`
    : "No ratings yet";

  return (
    <div className="flex items-center gap-1" role="img" aria-label={ariaLabel}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = getStarFill(star);
          return (
            <span key={star} className="relative inline-flex">
              <Star className="size-4 text-muted-foreground" />
              {fill !== "empty" && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: fill === "half" ? "50%" : "100%" }}
                >
                  <Star className="size-4 fill-yellow-400 text-yellow-400" />
                </span>
              )}
            </span>
          );
        })}
      </div>
      {hasRatings ? (
        <span className="text-sm text-muted-foreground">
          {average.toFixed(1)}{" "}
          <span className="text-xs">
            ({count} {count === 1 ? "rating" : "ratings"})
          </span>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">No ratings yet</span>
      )}
    </div>
  );
}

export function StarRatingInput({
  onRate,
  disabled,
}: {
  onRate: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Rate this course">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hovered !== null ? star <= hovered : false;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
            onClick={() => onRate(star)}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => !disabled && setHovered(null)}
            className="rounded-sm p-1.5 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Star
              className={
                filled
                  ? "size-5 fill-yellow-400 text-yellow-400"
                  : "size-5 text-muted-foreground"
              }
            />
          </button>
        );
      })}
    </div>
  );
}
