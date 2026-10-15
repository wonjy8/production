import { useEffect, useRef, useState } from "react";
import { cachedPhoto, preparePhoto } from "./photo-cache.js";
export function Photo({
  file,
  onSize,
  eager = false,
  fullSize = false,
}: {
  file: any;
  onSize?: (w: number, h: number) => void;
  eager?: boolean;
  fullSize?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [preview, setPreview] = useState<any>(() => cachedPhoto(file, fullSize)),
    [error, setError] = useState(false);
  useEffect(() => {
    let alive = true,
      observer: IntersectionObserver | undefined;
    const load = async () => {
      observer?.disconnect();
      try {
        const value = await preparePhoto(file, fullSize);
        if (alive) {
          setPreview(value);
          setError(false);
          onSize?.(value.width, value.height);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    const cached = cachedPhoto(file, fullSize);
    setPreview(cached);
    setError(false);
    if (cached) {
      onSize?.(cached.width, cached.height);
    }
    if (
      cached ||
      eager ||
      typeof IntersectionObserver === "undefined" ||
      !ref.current
    )
      load();
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) load();
        },
        { rootMargin: "200px" },
      );
      observer.observe(ref.current);
    }
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [
    file.id,
    file.sha256,
    file.updatedAt,
    JSON.stringify(file.photoEdit),
    eager,
    fullSize,
  ]);
  return (
    <div
      ref={ref}
      className="photo-preview"
      style={{
        aspectRatio: preview ? preview.width / preview.height : undefined,
      }}
    >
      {preview ? (
        <img
          className="edited-photo"
          src={preview.url}
          width={preview.width}
          height={preview.height}
          alt="사진"
          draggable={false}
        />
      ) : (
        <div
          className="photo-placeholder"
          role="img"
          aria-label={error ? "사진 불러오기 실패" : "사진"}
        />
      )}
    </div>
  );
}
