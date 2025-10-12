/**
 * ResourceGauges Component Styles
 *
 * Material-UI v6 styled components for resource gauges
 */

import { styled, Box, Typography } from '@mui/material';

export const GaugesContainer = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: theme.spacing(3),
  padding: theme.spacing(2),
  width: '100%',
  maxWidth: '1200px',
  margin: '0 auto',
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
    gap: theme.spacing(2),
  },
}));

export const GaugeWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[2],
  transition: 'all 0.3s ease-in-out',
  '&:hover': {
    boxShadow: theme.shadows[4],
    transform: 'translateY(-2px)',
  },
}));

interface GaugeContainerProps {
  size: 'small' | 'medium' | 'large';
}

const sizeMap = {
  small: 120,
  medium: 160,
  large: 200,
};

export const GaugeContainer = styled(Box)<GaugeContainerProps>(({ size }) => ({
  position: 'relative',
  width: sizeMap[size],
  height: sizeMap[size],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

export const GaugeValue = styled(Box)(() => ({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 1,
}));

export const ValueText = styled(Typography)(({ theme }) => ({
  fontSize: '2rem',
  fontWeight: 700,
  lineHeight: 1,
  color: theme.palette.text.primary,
}));

export const UnitText = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(0.5),
}));

export const LabelText = styled(Typography)(({ theme }) => ({
  fontSize: '1rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
  marginTop: theme.spacing(1.5),
  textAlign: 'center',
}));

interface NeedleProps {
  angle: number;
  color: string;
  size: 'small' | 'medium' | 'large';
  animated: boolean;
  duration: number;
}

const needleLengthMap = {
  small: 50,
  medium: 70,
  large: 90,
};

export const Needle = styled(Box)<NeedleProps>(({ angle, color, size, animated, duration }) => ({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: 3,
  height: needleLengthMap[size],
  backgroundColor: color,
  transformOrigin: 'top center',
  transform: `translate(-50%, 0) rotate(${angle}deg)`,
  transition: animated ? `transform ${duration}ms ease-out` : 'none',
  borderRadius: '2px',
  boxShadow: `0 2px 4px rgba(0, 0, 0, 0.2)`,
  zIndex: 2,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 8,
    height: 8,
    backgroundColor: color,
    borderRadius: '50%',
    border: `2px solid ${color}`,
  },
}));

export const ThresholdIndicator = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: theme.spacing(1),
  right: theme.spacing(1),
  display: 'flex',
  gap: theme.spacing(0.5),
  alignItems: 'center',
}));

interface ThresholdDotProps {
  color: string;
}

export const ThresholdDot = styled(Box)<ThresholdDotProps>(({ color }) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: color,
  boxShadow: `0 0 4px ${color}`,
}));

export const TimestampText = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.disabled,
  marginTop: theme.spacing(0.5),
  textAlign: 'center',
}));
