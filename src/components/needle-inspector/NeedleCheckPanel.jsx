"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"
import lockIcon from '../../assets/icon/lock.png';
import unlockIcon from '../../assets/icon/unlock.png';

export default function NeedleCheckPanel({ mode, isMotorConnected, needlePosition, onNeedleUp, onNeedleDown, websocket, isWsConnected, onMotorPositionChange, resistance1, resistance2, resistance1Status, resistance2Status }) {
  // 모터 상태에 따라 needleStatus 동기화
  const [needleStatus, setNeedleStatus] = useState(needlePosition === 'UP' ? 'UP' : needlePosition === 'DOWN' ? 'DOWN' : 'MOVING')
  // 버튼에 표시할 텍스트 (다음 동작을 표시, MOVING일 때는 현재 상태 유지)
  const buttonText = needleStatus === 'UP' ? 'DOWN' : needleStatus === 'DOWN' ? 'UP' : (needlePosition === 'UP' ? 'UP' : 'DOWN')

  const [needleOffset, setNeedleOffset] = useState(0.1)
  const [needleProtrusion, setNeedleProtrusion] = useState(3.0)
  const [repeatCount, setRepeatCount] = useState(1)
  
  // 니들 설정 활성화 상태 (기본값: 비활성화)
  const [isNeedleCheckEnabled, setIsNeedleCheckEnabled] = useState(false)
  // 니들 소음 확인 상태
  const [isNeedleNoiseChecking, setIsNeedleNoiseChecking] = useState(false)

  // WebSocket을 통한 모터 위치 명령 전송 함수
  const sendMotorCommand = (targetPosition) => {
    if (!websocket || !isWsConnected) {
      console.log('WebSocket 연결되지 않음. 모터 명령 전송 실패:', targetPosition);
      return;
    }

    const msg = {
      cmd: "move",
      position: targetPosition,
      mode: "position",
    }

    console.log(` 모터 위치 명령 전송:`, msg);
    websocket.send(JSON.stringify(msg));
  }
  
  // 니들 오프셋과 돌출 부분의 UP/DOWN 상태 (기본값: UP)
  const [needleOffsetState, setNeedleOffsetState] = useState('UP')
  const [needleProtrusionState, setNeedleProtrusionState] = useState('UP')
  
  // 니들 설정 잠금/해제 토글 함수
  const handleNeedleCheckToggle = () => {
    setIsNeedleCheckEnabled(!isNeedleCheckEnabled)
  }

  // needlePosition prop이 변경될 때마다 needleStatus 동기화
  useEffect(() => {
    if (needlePosition === 'UP') {
      setNeedleStatus('UP')
    } else if (needlePosition === 'DOWN') {
      setNeedleStatus('DOWN')
    } else {
      setNeedleStatus('MOVING')
    }
  }, [needlePosition])

  // 니들 오프셋과 돌출 부분 값이 변경될 때마다 계산된 모터 위치를 상위로 전달
  useEffect(() => {
    const calculatedPosition = Math.round((needleOffset + needleProtrusion) * 100);
    if (onMotorPositionChange) {
      onMotorPositionChange(calculatedPosition);
    }
  }, [needleOffset, needleProtrusion, onMotorPositionChange])

  const toggleNeedleStatus = () => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    if (needleStatus === 'DOWN') {
      console.log("🎯 니들 UP 명령 실행")
      onNeedleUp()
    } else if (needleStatus === 'UP') {
      console.log("🎯 니들 DOWN 명령 실행")
      onNeedleDown()
    }
    // MOVING 상태일 때는 버튼 비활성화
  }

  const handleUpDown = async () => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    if (needleStatus === 'MOVING') {
      console.error("❌ 니들이 이미 움직이고 있습니다.")
      return
    }

    console.log(`🔄 니들 UP & DOWN ${repeatCount}회 시작 (명령어 큐 방식)`)
    
    for (let i = 0; i < repeatCount; i++) {
      console.log(`🔄 ${i + 1}/${repeatCount} 사이클 시작`)
      
      // UP 명령 (840)
      console.log("🎯 니들 UP 명령 실행 (840)")
      onNeedleUp()
      
      // UP 동작 완료 대기 (고정 시간)
      await new Promise(resolve => setTimeout(resolve, 90))
      
      // DOWN 명령 (0)
      console.log("🎯 니들 DOWN 명령 실행 (0)")
      onNeedleDown()
      
      // DOWN 동작 완료 대기 (고정 시간)
      await new Promise(resolve => setTimeout(resolve, 90))
      
      // 다음 사이클 전 잠시 대기
      if (i < repeatCount - 1) {
        console.log(`⏳ 다음 사이클 대기 중...`)
        await new Promise(resolve => setTimeout(resolve, 90))
      }
    }
    
    console.log(`✅ 니들 UP & DOWN ${repeatCount}회 완료`)
  }

  // 1.0부터 20.0까지 0.1 간격으로 생성
  const needleLengthOptions = Array.from({ length: 191 }, (_, i) => (1 + i * 0.1).toFixed(1))

  return (
    <Panel title={
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 className="text-lg font-bold">니들 설정</h2>
        <img
          src={isNeedleCheckEnabled ? unlockIcon : lockIcon}
          alt={isNeedleCheckEnabled ? 'Unlocked' : 'Locked'}
          style={{ cursor: 'pointer', height: '1.25rem' }} // h-5 equivalent
          onClick={handleNeedleCheckToggle}
          title={isNeedleCheckEnabled ? '설정 잠금' : '설정 잠금 해제'}
        />
      </div>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5dvh' }}>
        {/* 니들 오프셋 (mm) */}
        <div style={{ display: 'flex', gap: '0.5dvw' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 오프셋 (mm)</label>
            <Input 
              type="number"
              value={needleOffset}
              onChange={(e) => setNeedleOffset(Number(e.target.value))}
              step="0.01"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '20%',
                fontSize: '1.2dvh', 
                height: '4dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                if (needleOffsetState === 'UP') {
                  const motorPosition = Math.round(needleOffset * 100);
                  console.log('니들 오프셋 UP:', needleOffset, '모터 위치:', motorPosition);
                  // WebSocket을 통한 모터 위치 명령 전송
                  sendMotorCommand(motorPosition);
                  setNeedleOffsetState('DOWN');
                } else {
                  console.log('니들 오프셋 DOWN: 모터 위치 0');
                  // WebSocket을 통한 모터 위치 명령 전송
                  sendMotorCommand(0);
                  setNeedleOffsetState('UP');
                }
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#D1D5DB' : '#BFB2E4',
                width: '30%',
                fontSize: '1.4dvh',
                height: '4dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                marginLeft: '1dvw',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              {needleOffsetState}
            </Button>
          </div>
        </div>

        {/* 니들 돌출 부분 (mm) */}
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 돌출 부분 (mm)</label>
            <Input 
              type="number"
              value={needleProtrusion}
              onChange={(e) => setNeedleProtrusion(Number(e.target.value))}
              step="0.1"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '20%',
                fontSize: '1.2dvh', 
                height: '4dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                if (needleProtrusionState === 'UP') {
                  const motorPosition = Math.round((needleOffset + needleProtrusion) * 100);
                  console.log('니들 돌출 부분 UP:', needleOffset, '+', needleProtrusion, '=', needleOffset + needleProtrusion, '모터 위치:', motorPosition);
                  // WebSocket을 통한 모터 위치 명령 전송
                  sendMotorCommand(motorPosition);
                  setNeedleProtrusionState('DOWN');
                } else {
                  console.log('니들 돌출 부분 DOWN: 모터 위치 0');
                  // WebSocket을 통한 모터 위치 명령 전송
                  sendMotorCommand(0);
                  setNeedleProtrusionState('UP');
                }
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#D1D5DB' : '#BFB2E4',
                width: '30%',
                fontSize: '1.4dvh',
                height: '4dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                marginLeft: '1dvw',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              {needleProtrusionState}
            </Button>
          </div>
        </div>

        {/* 니들 소음 확인 */}
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', gap: '0.5dvw' }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
              <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 소음 확인</label>
              <Input 
                type="number"
                value={repeatCount}
                onChange={(e) => setRepeatCount(Number(e.target.value))}
                min={1}
                disabled={false}
                style={{ 
                  backgroundColor: '#171C26', 
                  color: 'white', 
                  textAlign: 'center',
                  width: '20%',
                  fontSize: '1.2dvh', 
                  height: '4dvh',
                  opacity: 1
                }}
              />

              <Button
                onClick={handleUpDown}
                disabled={!isMotorConnected || needleStatus === 'MOVING'}
                style={{
                  backgroundColor: '#171C26',
                  color: (!isMotorConnected) ? '#D1D5DB' : '#BFB2E4',
                  width: '30%',
                  fontSize: '1.2dvh',
                  height: '4dvh',
                  border: `1px solid ${(!isMotorConnected) ? '#6B7280' : '#BFB2E4'}`,
                  borderRadius: '0.375rem',
                  marginLeft: '1dvw',
                  cursor: (!isMotorConnected || needleStatus === 'MOVING') ? 'not-allowed' : 'pointer',
                  opacity: (!isMotorConnected || needleStatus === 'MOVING') ? 0.6 : 1
                }}
              >
                UP & DOWN
              </Button>
            </div>
          </div>
        </div>
        
        {/* 저항 모니터링 섹션 */}
        <div style={{
          borderTop: '1px solid #374151',
          paddingTop: '1.5dvh',
          marginTop: '1.5dvh'
        }}>
          <div style={{ marginBottom: '1dvh', fontSize: '1.3dvh', color: '#D1D5DB' }}>실시간 저항 모니터링</div>
          
          {/* 저항 1 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1dvw',
            marginBottom: '1dvh'
          }}>
            <label style={{ width: '30%', fontSize: '1.2dvh', color: '#9CA3AF' }}>저항 1:</label>
            <div style={{
              flex: 1,
              padding: '0.8dvh 1dvw',
              backgroundColor: '#1F2937',
              borderRadius: '0.375rem',
              border: `1px solid ${
                resistance1Status === 'OK' ? '#10B981' : 
                resistance1Status === 'ERROR' ? '#EF4444' : 
                '#6B7280'
              }`,
              color: resistance1Status === 'OK' ? '#10B981' : 
                     resistance1Status === 'ERROR' ? '#EF4444' : 
                     '#9CA3AF',
              fontSize: '1.2dvh',
              textAlign: 'center',
              fontFamily: 'monospace'
            }}>
              {resistance1 !== null && resistance1 !== undefined ? 
                `${(0.001 * resistance1).toFixed(3)} kΩ` : 
                'N/A'}
            </div>

          </div>
          
          {/* 저항 2 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1dvw'
          }}>
            <label style={{ width: '30%', fontSize: '1.2dvh', color: '#9CA3AF' }}>저항 2:</label>
            <div style={{
              flex: 1,
              padding: '0.8dvh 1dvw',
              backgroundColor: '#1F2937',
              borderRadius: '0.375rem',
              border: `1px solid ${
                resistance2Status === 'OK' ? '#10B981' : 
                resistance2Status === 'ERROR' ? '#EF4444' : 
                '#6B7280'
              }`,
              color: resistance2Status === 'OK' ? '#10B981' : 
                     resistance2Status === 'ERROR' ? '#EF4444' : 
                     '#9CA3AF',
              fontSize: '1.2dvh',
              textAlign: 'center',
              fontFamily: 'monospace'
            }}>
              {resistance2 !== null && resistance2 !== undefined ? 
                `${(0.001 * resistance2).toFixed(3)} kΩ` : 
                'N/A'}
            </div>

          </div>
        </div>
      </div>
    </Panel>
  )
}
