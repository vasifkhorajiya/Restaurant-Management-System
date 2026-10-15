const offers = [
  { cls: 'o1', tag: 'Limited Time', title: '20% OFF above ₹299', sub: 'Use code SPICE20 at checkout' },
  { cls: 'o2', tag: 'Free Delivery', title: 'On your first order', sub: 'No minimum order value' },
  { cls: 'o3', tag: 'Dine In', title: 'Book a table, skip the wait', sub: 'Reserve in under a minute' },
];

export default function OfferStrip() {
  return (
    <div className="offer-strip">
      {offers.map((o) => (
        <div className={`offer-card ${o.cls}`} key={o.title}>
          <div className="tag">{o.tag}</div>
          <h6>{o.title}</h6>
          <p>{o.sub}</p>
        </div>
      ))}
    </div>
  );
}
