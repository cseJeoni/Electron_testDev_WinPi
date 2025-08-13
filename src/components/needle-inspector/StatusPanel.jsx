import { useState } from "react"
import Panel from "./Panel"
import { Input } from "./Input"
import { Button } from "./Button"
import { useAuth } from "../../hooks/useAuth"

export default function StatusPanel({ mode, workStatus = 'waiting', needleTipConnected = false, isWaitingEepromRead = false }) {
  // Firebase Authentication 훅 사용
  const { user, loading, error, login, logout, isAuthenticated } = useAuth()
  
  // 로그인 폼 상태 관리
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // 로그인 처리 함수 (Firebase)
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      return;
    }

    setIsLoggingIn(true);
    const userEmail = `${email.trim()}@solismsn.local`;
    const result = await login(userEmail, password.trim());
    
    if (result.success) {
      setEmail('');
      setPassword('');
    }
    
    setIsLoggingIn(false);
  }

  // 로그아웃 처리 함수 (Firebase)
  const handleLogout = async () => {
    const result = await logout()
    
    if (result.success) {
      setLoginMessage('로그아웃되었습니다.')
      console.log('로그아웃 완료')
    } else {
      setLoginMessage(result.error)
    }
  }

  // Enter 키 처리
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoggingIn) {
      handleLogin()
    }
  }

  // 상태에 따른 스타일과 메시지 정의
  const getStatusInfo = (status, isWaitingRead = false) => {
    // EEPROM 읽기 대기 중일 때는 우선적으로 표시
    if (isWaitingRead) {
      return { bg: 'bg-[#F59E0B]', text: 'EEPROM 읽기 중...', textColor: 'text-white' }
    }
    
    switch (status) {
      case 'waiting':
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
      case 'disconnected':
        return { bg: 'bg-[#F3950F]', text: '니들팁 없음', textColor: 'text-white' }
      case 'write_success':
        return { bg: 'bg-[#0CB56C]', text: '저장 완료', textColor: 'text-white' }
      case 'write_failed':
        return { bg: 'bg-[#C22727]', text: '저장 실패', textColor: 'text-white' }
      default:
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
    }
  }

  // GPIO23 인터럽트 기반 니들팁 상태에 따라 실시간으로 상태 결정
  let effectiveStatus;
  if (!needleTipConnected) {
    // GPIO23이 HIGH일 때 '니들팁 없음' 표시
    effectiveStatus = 'disconnected';
  } else {
    // GPIO23이 LOW일 때 (니들팁 연결됨) workStatus를 따름
    effectiveStatus = workStatus;
  }

  const statusInfo = getStatusInfo(effectiveStatus, isWaitingEepromRead)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1dvh' }}>
      <Panel title="작업 상태">
        <div className={`${statusInfo.bg} rounded-md flex items-center justify-center`} style={{ height: '10dvh' }}>
          <span className={`text-2xl font-bold ${statusInfo.textColor}`}>{statusInfo.text}</span>
        </div>
      </Panel>
      
      <Panel title="작업자 로그인">
        <div>
          
          {/* Firebase 로딩 상태 */}
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#9CA3AF', 
              fontSize: '1.2dvh' 
            }}>
              인증 상태 확인 중...
            </div>
          ) : !isAuthenticated ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw', padding: '0.5dvh' }}>
                <label style={{ width: '7dvw', fontSize: '1.5dvh', color: '#D1D5DB' }}>아이디</label>
                <Input 
                  type="text" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#171C26', 
                    border: '1px solid #374151', 
                    color: 'white', 
                    fontSize: '1.2dvh', 
                    height: '3.5dvh' 
                  }} 
                  placeholder="아이디를 입력하세요"
                  disabled={isLoggingIn}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw', padding: '0.5dvh' }}>
                <label style={{ width: '7dvw', fontSize: '1.5dvh', color: '#D1D5DB' }}>비밀번호</label>
                <Input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#171C26', 
                    border: '1px solid #374151', 
                    color: 'white', 
                    fontSize: '1.2dvh', 
                    height: '3.5dvh' 
                  }} 
                  placeholder="비밀번호를 입력하세요"
                  disabled={isLoggingIn}
                />
              </div>
              {error ? (
                <div style={{
                  color: '#F87171',
                  textAlign: 'center',
                  fontSize: '1.4dvh',
                  padding: '0.8dvh 0',
                  marginTop: '0.5dvh',
                  height: '3.5dvh', // 버튼과 높이를 맞춤
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                }}>
                  {error}
                </div>
              ) : (
                <Button
                  onClick={handleLogin}
                  disabled={!email.trim() || !password.trim() || isLoggingIn}
                  style={{
                    width: '100%',
                    fontWeight: 'bold',
                    marginTop: '0.5dvh',
                    padding: '0.8dvh 0',
                    fontSize: '1.5dvh',
                    backgroundColor: (!email.trim() || !password.trim() || isLoggingIn) ? '#374151' : '#4ADE80',
                    color: (!email.trim() || !password.trim() || isLoggingIn) ? '#9CA3AF' : 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    height: '3.5dvh', // 에러 메시지와 높이를 맞춤
                  }}
                >
                  {isLoggingIn ? '로그인 중...' : '로그인'}
                </Button>
              )}
              

            </>
          ) : (
            <>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '1dvh',
                backgroundColor: '#0CB56C',
                borderRadius: '0.375rem',
                color: 'white'
              }}>
                <span style={{ fontSize: '1.5dvh', fontWeight: 'bold' }}>
                  작업자 : {user?.name || user?.email.split('@')[0]}
                </span>
                <Button 
                  onClick={handleLogout}
                  style={{
                    padding: '0.5dvh 1dvw',
                    fontSize: '1.2dvh',
                    backgroundColor: 'transparent',
                    color: 'white',
                    border: '1px solid white',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  로그아웃
                </Button>
              </div>
              

            </>
          )}
        </div>
      </Panel>
    </div>
  )
}
