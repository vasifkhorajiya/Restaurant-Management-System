export default function VegMark({ isVeg }) {
  return <span className={`veg-mark${isVeg ? '' : ' non-veg'}`} title={isVeg ? 'Veg' : 'Non-Veg'} />;
}
