declare namespace ort {
  type TensorType = 'float32' | 'uint8'

  class Tensor {
    constructor(type: TensorType, data: Float32Array | Uint8Array, dims: number[])
    data: Float32Array | Uint8Array
    dims: number[]
  }

  class InferenceSession {
    inputNames: string[]
    outputNames: string[]
    static create(
      modelBuffer: ArrayBuffer,
      options?: { executionProviders?: string[] }
    ): Promise<InferenceSession>
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>
  }

  const env: {
    wasm: {
      wasmPaths?: string
      numThreads?: number
      simd?: boolean
      proxy?: boolean
    }
  }
}

interface Navigator {
  gpu?: {
    requestAdapter?: () => Promise<unknown>
  }
}
