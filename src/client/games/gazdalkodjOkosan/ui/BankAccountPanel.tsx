import { useState } from 'react';
import { GAZDALKODJ_CARD_BACK_URL, GAZDALKODJ_CARD_FRONT_URL } from './gazdalkodjOkosanAssets';
import styles from './BankAccountPanel.module.css';

export interface BankAccountPanelProps {
  account: { balance: number } | null;
}

/** Stylized OTP bank-card visual for an open account — the real balance is always overlaid as text; the photo is decoration, never the data source. Click flips to the back. */
export function BankAccountPanel({ account }: BankAccountPanelProps) {
  const [showBack, setShowBack] = useState(false);

  if (!account) return <p className={styles.noAccount}>Folyószámla: nincs nyitva</p>;

  return (
    <button type="button" className={styles.card} onClick={() => setShowBack((value) => !value)}>
      <img src={showBack ? GAZDALKODJ_CARD_BACK_URL : GAZDALKODJ_CARD_FRONT_URL} alt="Bankkártya" className={styles.cardImage} />
      {!showBack && <span className={styles.balance}>{account.balance.toLocaleString('hu-HU')} EUR</span>}
    </button>
  );
}
