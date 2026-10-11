import { createContext, type PropsWithChildren, useContext, useState } from 'react'

type WritingContextValue = {
  writing: boolean
  setWriting: (writing: boolean) => void
}

const WritingContext = createContext<WritingContextValue | null>(null)

/**
 * 페이지의 쓰기 상태를 톱바까지 올리는 작은 통로다.
 *
 * 브라우저 뒤로가기는 막지 못한다. main.tsx가 데이터 라우터가 아닌 BrowserRouter를 쓰므로
 * useBlocker를 사용할 수 없고, 이 컨텍스트는 화면 안에 보이는 이탈 수단만 잠근다.
 */
export function WritingProvider({ children }: PropsWithChildren) {
  const [writing, setWriting] = useState(false)
  return (
    <WritingContext.Provider value={{ writing, setWriting }}>
      {children}
    </WritingContext.Provider>
  )
}

export function useWriting(): WritingContextValue {
  const value = useContext(WritingContext)
  if (value === null) throw new Error('useWriting은 WritingProvider 안에서 사용해야 합니다')
  return value
}
