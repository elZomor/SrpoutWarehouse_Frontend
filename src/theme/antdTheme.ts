import type { ThemeConfig } from 'antd';
import { borderRadius, colors, fontFamily } from './tokens';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorLink: colors.primary,
    colorLinkHover: colors.primaryDark,
    colorError: colors.danger,
    colorErrorBg: colors.dangerBg,
    colorErrorBorder: colors.dangerBorder,
    colorSuccess: colors.success,
    colorSuccessBg: colors.successBg,
    colorWarning: colors.warning,
    colorWarningBg: colors.warningBg,
    colorInfo: colors.info,
    colorInfoBg: colors.infoBg,
    colorTextSecondary: colors.textMuted,
    colorBorder: colors.border,
    colorBgLayout: colors.pageBackground,
    borderRadius,
    fontFamily,
  },
  components: {
    Layout: {
      headerBg: colors.primary,
      bodyBg: colors.pageBackground,
      siderBg: colors.primary,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(255, 255, 255, 0.75)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.12)',
      darkItemSelectedColor: '#FFFFFF',
      darkGroupTitleColor: 'rgba(255, 255, 255, 0.4)',
    },
  },
};
