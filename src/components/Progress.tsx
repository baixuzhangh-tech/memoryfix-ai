interface ProgressProps {
  percent: number
}

export default function Progress({ percent }: ProgressProps) {
  const safePercent = Number.isFinite(percent)
    ? Math.min(Math.max(percent, 0), 100)
    : 0

  return (
    <div className="w-full flex items-center">
      <div className="relative flex-1 bg-black/20 h-2 mr-4">
        <div
          className="absolute left-0 top-0 h-full bg-black duration-100"
          style={{ width: `${safePercent}%` }}
        />
      </div>
      <span className="w-20 text-right">{safePercent.toFixed(2)}%</span>
    </div>
  )
}
