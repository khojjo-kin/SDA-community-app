import { Alert } from 'react-native';
import { en, t } from './i18n';

/** The report reason admins read for copyright and trademark reports: in English, like every other reason. */
export const COPYRIGHT_REASON: string = en['report.copyright'];

/**
 * Shown once a "Copyright or trademark" report has been filed. A report from the app isn't a legal
 * notice (it lacks what the law asks for), so this says a formal one can also be sent, and offers the
 * Copyright policy, which explains how. Resolves to true when the member chose to read the policy,
 * a moment after the alert has gone, so the policy's sheet can open without catching it mid-close.
 */
export function explainCopyrightReport(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('report.copyrightTitle'),
      t('report.copyrightBody'),
      [
        { text: t('report.ok'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('report.readPolicy'), onPress: () => setTimeout(() => resolve(true), 350) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
