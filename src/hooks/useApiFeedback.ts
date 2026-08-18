import { App } from 'antd';

// WRH-81: the single shared entry point every page uses to show a
// success/failure snackbar for an add/update/delete API call, instead of
// each page destructuring `App.useApp().message` and calling
// `message.success`/`message.error` directly (which is how this repo did
// it before this ticket - functionally fine per-call, but AC-4 wants one
// shared hook so behavior/positioning/stacking stays consistent by
// construction, not by convention).
export function useApiFeedback() {
  const { message } = App.useApp();

  return {
    notifySuccess: (content: string) => message.success(content),
    notifyError: (content: string) => message.error(content),
    notifyWarning: (content: string) => message.warning(content),
  };
}
