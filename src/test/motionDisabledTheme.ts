import type { ThemeConfig } from 'antd';

// jsdom implements the `transition`/`animation` CSS properties and the
// TransitionEvent/AnimationEvent constructors, so AntD's rc-motion-backed
// components (Popconfirm, Modal, Tabs, ...) think transitions are supported
// and wait for a real transitionend/animationend event - one jsdom never
// fires, since it doesn't run an actual layout/paint engine. Components
// without an explicit `motionDeadline` fallback then block until the
// global testTimeout, and ones that do have one (e.g. Wave's 5000ms) still
// burn real wall-clock time per interaction. Disabling the `motion` theme
// token routes every CSSMotion instance through @rc-component/motion's own
// "none transition" escape hatch (isSupportTransition returns false when
// contextMotion === false), which resolves enter/leave synchronously
// instead of waiting on either the event or the deadline timer.
export const motionDisabledTheme: ThemeConfig = { token: { motion: false } };
