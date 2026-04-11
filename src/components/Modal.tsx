import { ReactNode } from 'react'

interface ModalProps {
  children?: ReactNode
}

export default function Modal(props: ModalProps) {
  const { children } = props
  return (
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-[#211915] bg-opacity-30 backdrop-filter backdrop-blur-md',
      ].join(' ')}
    >
      <div className="max-h-[90vh] max-w-4xl overflow-auto rounded-[2rem] bg-[#f8f1e7] p-8 shadow-2xl md:p-12">
        {children}
      </div>
    </div>
  )
}
