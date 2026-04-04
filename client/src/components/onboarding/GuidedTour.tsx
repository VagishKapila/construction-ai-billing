/**
 * GuidedTour Component — Step-by-step onboarding overlay
 * Highlights UI elements and explains features with smooth animations
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  FolderPlus,
  Upload,
  Grid3X3,
  FileDown,
  Mail,
  FileCheck,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface TourStep {
  target: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export interface GuidedTourProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="welcome"]',
    title: 'Welcome to ConstructInvoice AI',
    description: "Let's get you set up in 2 minutes. You'll learn how to create projects, upload schedules of value, and generate G702/G703 pay applications.",
    icon: <Sparkles className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="new-project"]',
    title: 'Create Your First Project',
    description: 'Start here by clicking "New Project". Enter project details, upload your Schedule of Values, and set payment terms.',
    icon: <FolderPlus className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="sov-upload"]',
    title: 'Upload Your Schedule of Values',
    description: 'We accept Excel (.xlsx), CSV, PDF (.pdf), and Word (.docx) files. We\'ll automatically parse line items, descriptions, and amounts.',
    icon: <Upload className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="pay-app-grid"]',
    title: 'Enter Work Progress',
    description: 'As work progresses, enter the percentage completed for each line item. The G702/G703 math is calculated automatically.',
    icon: <Grid3X3 className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="download-pdf"]',
    title: 'Download Your Pay Application',
    description: 'Generate a professional G702/G703 PDF with your company logo, signature, and all pay app details — ready to submit.',
    icon: <FileDown className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="send-email"]',
    title: 'Send to Owner',
    description: 'Email the pay application directly to the project owner with a single click. Include a custom message if needed.',
    icon: <Mail className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="lien-waiver"]',
    title: 'Generate Lien Waivers',
    description: 'Create conditional or unconditional lien waivers with one click. All amounts and dates auto-fill from your pay app.',
    icon: <FileCheck className="h-8 w-8 text-indigo-500" />,
  },
  {
    target: '[data-tour="settings"]',
    title: 'Update Your Company Profile',
    description: 'In Settings, upload your company logo, add your signature, and set contact info. These auto-fill on all future projects.',
    icon: <Settings className="h-8 w-8 text-indigo-500" />,
  },
];

export function GuidedTour({ isOpen, onComplete, onSkip }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentTourStep = TOUR_STEPS[currentStep];
  const totalSteps = TOUR_STEPS.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  /**
   * Find and measure the target element
   */
  const updateTargetPosition = () => {
    if (!currentTourStep) return;

    const target = document.querySelector(currentTourStep.target);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    } else {
      // Target not found (user on wrong page) — show centered
      setTargetRect(null);
    }
  };

  /**
   * Initialize tour and position spotlight
   */
  useEffect(() => {
    if (!isOpen) return;

    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 300);
    updateTargetPosition();

    // Update on window resize
    const handleResize = () => updateTargetPosition();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, currentStep]);

  /**
   * Navigate to next step
   */
  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  /**
   * Navigate to previous step
   */
  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  /**
   * Complete tour
   */
  const handleComplete = () => {
    onComplete();
  };

  /**
   * Skip tour
   */
  const handleSkip = () => {
    onSkip();
  };

  if (!isOpen) return null;

  const padding = 8;
  const spotlightX = targetRect ? targetRect.left - padding : 0;
  const spotlightY = targetRect ? targetRect.top - padding : 0;
  const spotlightWidth = targetRect ? targetRect.width + padding * 2 : 0;
  const spotlightHeight = targetRect ? targetRect.height + padding * 2 : 0;

  /**
   * Calculate tooltip position
   */
  let tooltipClass = 'left-1/2 -translate-x-1/2 top-full mt-4';
  if (targetRect) {
    const tooltipEstHeight = 320;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - (spotlightY + spotlightHeight + padding);

    if (spaceBelow < tooltipEstHeight) {
      // Position above
      tooltipClass = 'left-1/2 -translate-x-1/2 bottom-full mb-4';
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay with spotlight cutout */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black/50 transition-opacity duration-300"
        style={{
          clipPath: targetRect
            ? `polygon(
                0% 0%,
                0% 100%,
                100% 100%,
                100% 0%,
                0% 0%,
                ${spotlightX}px ${spotlightY}px,
                ${spotlightX}px ${spotlightY + spotlightHeight}px,
                ${spotlightX + spotlightWidth}px ${spotlightY + spotlightHeight}px,
                ${spotlightX + spotlightWidth}px ${spotlightY}px,
                ${spotlightX}px ${spotlightY}px
              )`
            : undefined,
        }}
        onClick={handleSkip}
      />

      {/* Spotlight border (optional subtle glow) */}
      {targetRect && (
        <div
          className="fixed pointer-events-none border-2 border-indigo-400 rounded-lg box-border shadow-lg"
          style={{
            top: `${spotlightY}px`,
            left: `${spotlightX}px`,
            width: `${spotlightWidth}px`,
            height: `${spotlightHeight}px`,
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          'fixed z-50 bg-white rounded-lg shadow-2xl p-6 max-w-sm w-[90vw] md:w-full',
          'transition-all duration-300',
          isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
          tooltipClass,
          targetRect ? 'pointer-events-auto' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
        style={
          !targetRect
            ? {
                transform: 'translate(-50%, -50%)',
              }
            : undefined
        }
      >
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          {currentTourStep.icon}
        </div>

        {/* Step counter */}
        <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">
          Step {currentStep + 1} of {totalSteps}
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {currentTourStep.title}
        </h3>

        {/* Description */}
        <p className="text-gray-700 text-sm leading-relaxed mb-6">
          {currentTourStep.description}
        </p>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-6">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                idx === currentStep ? 'bg-indigo-600' : 'bg-gray-300',
              )}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {/* Back button */}
          {!isFirstStep && (
            <button
              onClick={handleBack}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}

          {/* Skip button */}
          <button
            onClick={handleSkip}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-transparent rounded-lg transition-colors"
          >
            Skip
          </button>

          {/* Next/Done button */}
          <button
            onClick={handleNext}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            {isLastStep ? 'Got it!' : 'Next'}
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Close button (top right) */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close tour"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
