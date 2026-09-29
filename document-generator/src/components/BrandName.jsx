/** The product name in its two brand colours: "Doc" blue + "Gen" orange. */
export default function BrandName({ className = '' }) {
  return (
    <span className={`brand-wordmark ${className}`} aria-label="DocGen">
      <span className="brand-doc">Doc</span>
      <span className="brand-gen">Gen</span>
    </span>
  );
}
