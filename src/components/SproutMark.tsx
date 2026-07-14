import { colors } from '../theme/tokens';

interface SproutMarkProps {
  size?: number;
}

export function SproutMark({ size = 56 }: SproutMarkProps) {
  const innerSize = Math.round(size * 0.39);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        background: colors.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: '50%',
          background: colors.accent,
        }}
      />
    </div>
  );
}
