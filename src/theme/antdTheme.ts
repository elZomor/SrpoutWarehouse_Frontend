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
    },
  },
};
