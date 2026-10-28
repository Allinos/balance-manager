import Icon from './Icon.jsx';
import { useAmountsHidden } from '../hooks/usePrivacy.js';

/** Eye button: show / hide document amounts on screen. */
export default function PrivacyToggle({ className = 'btn btn-sm', size = 15 }) {
  const [hidden, setHidden] = useAmountsHidden();
  const label = hidden ? 'Show amounts' : 'Hide amounts';
  return (
    <button className={`${className} privacy-toggle ${hidden ? 'on' : ''}`} onClick={() => setHidden(!hidden)} title={label} aria-label={label} aria-pressed={hidden} data-testid="privacy-toggle">
      <Icon name={hidden ? 'eyeOff' : 'eye'} size={size} />
    </button>
  );
}
