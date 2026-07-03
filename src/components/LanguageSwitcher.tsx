import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const nextLanguage = i18n.resolvedLanguage === 'ar' ? 'en' : 'ar';

  return (
    <Button onClick={() => void i18n.changeLanguage(nextLanguage)}>
      {nextLanguage === 'ar' ? 'العربية' : 'English'}
    </Button>
  );
}
