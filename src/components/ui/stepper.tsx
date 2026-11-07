import * as React from "react"
import { CheckIcon, Loader2Icon } from "lucide-react"

import { cn } from "../../lib/utils"

type StepperOrientation = "horizontal" | "vertical"
type StepperVariant = "circle" | "line"
type StepperSize = "sm" | "md" | "lg"
type StepState = "inactive" | "active" | "completed" | "loading" | "error"

type StepItem = {
  id: string
  label: string
  description?: string
  optional?: boolean
  icon?: React.ComponentType<{ className?: string }>
}

type StepperContextValue = {
  activeIndex: number
  steps: StepItem[]
  orientation: StepperOrientation
  variant: StepperVariant
  size: StepperSize
  state?: "loading" | "error"
  goTo: (index: number) => void
  next: () => void
  prev: () => void
  reset: () => void
  isFirstStep: boolean
  isLastStep: boolean
  activeStep: StepItem | undefined
  getStepState: (index: number) => StepState
}

const StepperContext = React.createContext<StepperContextValue | undefined>(undefined)

function useStepperContext() {
  const value = React.useContext(StepperContext)
  if (!value) {
    throw new Error("Stepper compound components must be used within <Stepper>")
  }
  return value
}

type StepItemContextValue = {
  index: number
  step: StepItem
  state: StepState
}

const StepItemContext = React.createContext<StepItemContextValue | undefined>(undefined)

function useStepItemContext() {
  const value = React.useContext(StepItemContext)
  if (!value) {
    throw new Error("Stepper item compound components must be used within <StepperItem>")
  }
  return value
}

function getDefaultStepState(index: number, activeIndex: number, globalState?: "loading" | "error"): StepState {
  if (globalState === "loading" && index === activeIndex) {
    return "loading"
  }

  if (globalState === "error" && index === activeIndex) {
    return "error"
  }

  if (index < activeIndex) {
    return "completed"
  }

  if (index === activeIndex) {
    return "active"
  }

  return "inactive"
}

function Stepper({
  steps,
  activeIndex: controlledIndex,
  defaultIndex = 0,
  orientation = "horizontal",
  variant = "circle",
  size = "md",
  state,
  onActiveIndexChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  steps: StepItem[]
  activeIndex?: number
  defaultIndex?: number
  orientation?: StepperOrientation
  variant?: StepperVariant
  size?: StepperSize
  state?: "loading" | "error"
  onActiveIndexChange?: (index: number) => void
}) {
  const [uncontrolledIndex, setUncontrolledIndex] = React.useState(defaultIndex)
  const isControlled = typeof controlledIndex === "number"
  const activeIndex = isControlled ? controlledIndex : uncontrolledIndex

  const setActiveIndex = React.useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), Math.max(steps.length - 1, 0))
      if (!isControlled) {
        setUncontrolledIndex(clamped)
      }
      onActiveIndexChange?.(clamped)
    },
    [isControlled, steps.length, onActiveIndexChange]
  )

  const contextValue = React.useMemo<StepperContextValue>(
    () => ({
      activeIndex,
      steps,
      orientation,
      variant,
      size,
      state,
      goTo: setActiveIndex,
      next: () => setActiveIndex(activeIndex + 1),
      prev: () => setActiveIndex(activeIndex - 1),
      reset: () => setActiveIndex(defaultIndex),
      isFirstStep: activeIndex === 0,
      isLastStep: activeIndex === steps.length - 1,
      activeStep: steps[activeIndex],
      getStepState: (index: number) => getDefaultStepState(index, activeIndex, state),
    }),
    [activeIndex, defaultIndex, orientation, size, state, setActiveIndex, steps, variant]
  )

  return (
    <StepperContext.Provider value={contextValue}>
      <div
        data-slot="stepper"
        data-orientation={orientation}
        data-variant={variant}
        data-size={size}
        className={cn(
          "flex w-full gap-4",
          orientation === "vertical" ? "flex-col" : "flex-row items-start",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </StepperContext.Provider>
  )
}

function StepperNav({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { orientation } = useStepperContext()

  return (
    <div
      role="tablist"
      aria-orientation={orientation}
      data-slot="stepper-nav"
      className={cn(
        "flex gap-2",
        orientation === "vertical" ? "flex-col" : "flex-row items-center",
        className
      )}
      {...props}
    />
  )
}

function StepperItem({
  stepId,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { stepId: string }) {
  const { steps, activeIndex, getStepState } = useStepperContext()
  const index = steps.findIndex((step) => step.id === stepId)

  if (index < 0) {
    return null
  }

  const step = steps[index]
  const state = getStepState(index)

  const itemContextValue = React.useMemo<StepItemContextValue>(
    () => ({
      index,
      step,
      state,
    }),
    [index, state, step]
  )

  return (
    <StepItemContext.Provider value={itemContextValue}>
      <div
        role="presentation"
        data-slot="stepper-item"
        data-step-id={stepId}
        data-step-index={index}
        data-step-state={state}
        data-active={index === activeIndex ? "" : undefined}
        data-completed={state === "completed" ? "" : undefined}
        data-loading={state === "loading" ? "" : undefined}
        data-invalid={state === "error" ? "" : undefined}
        className={cn(
          "flex flex-1 flex-col gap-2",
          state === "active" && "text-foreground",
          state !== "active" && "text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </StepItemContext.Provider>
  )
}

function StepperIndicator({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { size } = useStepperContext()
  const { step, state, index } = useStepItemContext()

  const Icon = step.icon

  return (
    <div
      role="presentation"
      data-slot="stepper-indicator"
      data-step-state={state}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium transition-colors",
        size === "sm" && "size-6 text-xs",
        size === "md" && "size-8 text-sm",
        size === "lg" && "size-10 text-base",
        state === "active" && "border-primary text-primary",
        state === "completed" && "border-primary bg-primary text-primary-foreground",
        state === "error" && "border-destructive text-destructive",
        state === "loading" && "border-primary text-primary",
        state === "inactive" && "border-border text-muted-foreground",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          {Icon ? (
            <Icon className="size-4" />
          ) : state === "completed" ? (
            <CheckIcon className="size-4" />
          ) : state === "loading" ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <span>{index + 1}</span>
          )}
        </>
      )}
    </div>
  )
}

function StepperTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-title"
      className={cn("text-sm font-medium leading-none", className)}
      {...props}
    />
  )
}

function StepperDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function StepperSeparator({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & { orientation?: StepperOrientation }) {
  const { orientation: contextOrientation } = useStepperContext()
  const resolvedOrientation = orientation ?? contextOrientation

  return (
    <div
      role="presentation"
      data-slot="stepper-separator"
      aria-hidden="true"
      data-orientation={resolvedOrientation}
      className={cn(
        "shrink-0 bg-border",
        resolvedOrientation === "vertical" ? "mx-auto my-2 h-4 w-px self-center" : "my-auto ml-2 h-px flex-1",
        className
      )}
      {...props}
    />
  )
}

function StepperTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { goTo } = useStepperContext()
  const { index, state } = useStepItemContext()

  return (
    <button
      type="button"
      role="tab"
      data-slot="stepper-trigger"
      data-step-state={state}
      aria-selected={state === "active"}
      tabIndex={state === "active" ? 0 : -1}
      className={cn(
        "inline-flex items-center gap-2 rounded-md bg-transparent text-left outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
        className
      )}
      onClick={(event) => {
        goTo(index)
        onClick?.(event)
      }}
      {...props}
    />
  )
}

function StepperPanel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { activeIndex, activeStep } = useStepperContext()

  if (!activeStep) {
    return null
  }

  return (
    <div
      role="tabpanel"
      id={`stepper-panel-${activeStep.id}`}
      aria-labelledby={`stepper-trigger-${activeStep.id}`}
      data-slot="stepper-panel"
      data-step-id={activeStep.id}
      data-step-index={activeIndex}
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  )
}

function StepperActions({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-actions"
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  Stepper,
  StepperNav,
  StepperItem,
  StepperIndicator,
  StepperTitle,
  StepperDescription,
  StepperSeparator,
  StepperTrigger,
  StepperPanel,
  StepperActions,
  useStepperContext,
  useStepItemContext,
}
