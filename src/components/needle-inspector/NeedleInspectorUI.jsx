import { useState, useRef, useEffect } from "react"
import CameraView from "./CameraView"
import StatusPanel from "./StatusPanel"
import DataSettingsPanel from "./DataSettingsPanel"
import NeedleCheckPanel from "./NeedleCheckPanel"
import ModePanel from "./ModePanel"
import JudgePanel from "./JudgePanel" // Import JudgePanel
import { useAuth } from "../../hooks/useAuth.jsx" // Firebase 사용자 정보
import "../../css/NeedleInspector.css"

const PX_TO_MM = 1 / 3.78; // 1px 당 mm

// 모터 연결 기본 설정값
const MOTOR_CONFIG = {
  device: 'usb-motor',
  baudrate: 19200,
  parity: 'none',
  dataBits: 8,
  stopBits: 1
};

export default function NeedleInspectorUI() {
  const [mode, setMode] = useState("생산")
  const [makerCode, setMakerCode] = useState("4")
  
  // Firebase 사용자 정보
  const { user } = useAuth()
  
  // 비디오 서버 URL (실제 환경에 맞게 수정 필요)
  const videoServerUrl = "http://localhost:5000"
  
  // 모터 관련 상태
  const [ws, setWs] = useState(null)
  const [isWsConnected, setIsWsConnected] = useState(false)
  const [isMotorConnected, setIsMotorConnected] = useState(false)
  const [motorError, setMotorError] = useState(null)
  const [currentPosition, setCurrentPosition] = useState(0)
  const [needlePosition, setNeedlePosition] = useState('UNKNOWN') // UP, DOWN, UNKNOWN
  const [calculatedMotorPosition, setCalculatedMotorPosition] = useState(310) // (니들 오프셋 + 돌출 부분) * 100 기본값: (0.1 + 3.0) * 100 = 310
  
  // GPIO 18번 관련 상태
  const [gpioState, setGpioState] = useState('LOW') // HIGH, LOW (초기값 LOW로 설정)
  const prevGpioRef = useRef('LOW') // 이전 GPIO 상태 추적용 (useRef로 즉시 업데이트)
  
  // StatusPanel 상태 관리
  const [workStatus, setWorkStatus] = useState('waiting') // waiting, connected, disconnected, write_success, write_failed
  
  // DataSettingsPanel 상태 관리
  const [isStarted, setIsStarted] = useState(false) // START/STOP 상태
  const [readEepromData, setReadEepromData] = useState(null) // EEPROM 읽기 데이터
  const [needleTipConnected, setNeedleTipConnected] = useState(false) // GPIO23 기반 니들팁 연결 상태
  const [isWaitingEepromRead, setIsWaitingEepromRead] = useState(false) // EEPROM 읽기 응답 대기 상태
  
  // 저항 측정 상태 관리
  const [resistance1, setResistance1] = useState(null)
  const [resistance2, setResistance2] = useState(null)
  const [resistance1Status, setResistance1Status] = useState('N/A')
  const [resistance2Status, setResistance2Status] = useState('N/A')

  // 니들팁 연결 상태에 따른 작업 상태 업데이트
  useEffect(() => {
    if (needleTipConnected) {
      // 니들팁 연결 시: '저장 완료' 상태가 아닌 경우에만 '작업 대기'로 업데이트
      setWorkStatus(prevStatus => {
        if (prevStatus !== 'write_success') {
          return 'waiting';
        }
        return prevStatus; // write_success 상태는 유지
      });
    } else {
      // 니들팁 분리 시: 항상 '니들팁 없음'으로 업데이트 (저장 완료 상태라도)
      setWorkStatus('disconnected');
    }
  }, [needleTipConnected]); // workStatus 의존성 제거
  
  // Camera 1 상태
  const [drawMode1, setDrawMode1] = useState(false)
  const [selectedIndex1, setSelectedIndex1] = useState(-1)
  const [lineInfo1, setLineInfo1] = useState('선 정보: 없음')
  const [calibrationValue1, setCalibrationValue1] = useState(19.8) // 실측 캘리브레이션 값 (99px = 5mm)
  const [selectedLineColor1, setSelectedLineColor1] = useState('red') // 선택된 선 색상 (red, blue)
  const canvasRef1 = useRef(null)
  const videoContainerRef1 = useRef(null)
  const cameraViewRef1 = useRef(null) // CameraView ref 추가

  // Camera 2 상태
  const [drawMode2, setDrawMode2] = useState(false)
  const [selectedIndex2, setSelectedIndex2] = useState(-1)
  const [lineInfo2, setLineInfo2] = useState('선 정보: 없음')
  const [calibrationValue2, setCalibrationValue2] = useState(19.8) // 실측 캘리브레이션 값 (99px = 5mm)
  const [selectedLineColor2, setSelectedLineColor2] = useState('red') // 선택된 선 색상 (red, blue)
  const canvasRef2 = useRef(null)
  const videoContainerRef2 = useRef(null)
  const cameraViewRef2 = useRef(null) // CameraView ref 추가

  // 공통 상태
  const [lines1, setLines1] = useState([])
  const [lines2, setLines2] = useState([])
  const [isDrawing1, setIsDrawing1] = useState(false)
  const [isDrawing2, setIsDrawing2] = useState(false)
  const [startPoint1, setStartPoint1] = useState(null)
  const [startPoint2, setStartPoint2] = useState(null)

  // 두 카메라 이미지를 가로로 합쳐서 캡처하는 함수
  const captureMergedImage = async (judgeResult = null, eepromData = null) => {
    try {
      console.log('🔄 두 카메라 이미지 병합 캡처 시작...');
      
      // 두 카메라에서 개별 이미지 캡처
      const camera1Image = await cameraViewRef1.current?.captureImage(judgeResult, eepromData);
      const camera2Image = await cameraViewRef2.current?.captureImage(judgeResult, eepromData);
      
      if (!camera1Image || !camera2Image) {
        console.error('❌ 카메라 이미지 캡처 실패');
        return null;
      }
      
      // 이미지 로드를 위한 Promise 생성
      const loadImage = (dataURL) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = dataURL;
        });
      };
      
      // 두 이미지 로드
      const [img1, img2] = await Promise.all([
        loadImage(camera1Image),
        loadImage(camera2Image)
      ]);
      
      // 병합용 캔버스 생성 (가로로 이어붙이기)
      const mergedCanvas = document.createElement('canvas');
      const ctx = mergedCanvas.getContext('2d');
      
      // 캔버스 크기 설정 (두 이미지를 가로로 배치)
      mergedCanvas.width = img1.width + img2.width;
      mergedCanvas.height = Math.max(img1.height, img2.height);
      
      // 배경을 검은색으로 채우기
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height);
      
      // 첫 번째 이미지 그리기 (왼쪽)
      ctx.drawImage(img1, 0, 0);
      
      // 두 번째 이미지 그리기 (오른쪽)
      ctx.drawImage(img2, img1.width, 0);
      
      // 구분선 그리기 (선택사항)
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(img1.width, 0);
      ctx.lineTo(img1.width, mergedCanvas.height);
      ctx.stroke();
      
      // 병합된 이미지 데이터 생성
      const mergedDataURL = mergedCanvas.toDataURL('image/png');
      
      console.log('✅ 두 카메라 이미지 병합 완료');
      return mergedDataURL;
      
    } catch (error) {
      console.error('❌ 이미지 병합 실패:', error);
      return null;
    }
  };

  // 병합된 이미지를 파일로 저장하는 함수
  const saveMergedImage = async (judgeResult = null, eepromData = null) => {
    try {
      const mergedImageData = await captureMergedImage(judgeResult, eepromData);
      
      if (!mergedImageData) {
        console.error('❌ 병합 이미지 생성 실패');
        return;
      }
      
      // 현재 시간을 파일명에 포함
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `merged_capture_${timestamp}.png`;
      
      // Electron API 사용 가능한지 확인
      if (window.electronAPI && window.electronAPI.saveImage) {
        // Electron 환경에서 저장
        const base64Data = mergedImageData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        try {
          await window.electronAPI.saveImage(buffer, filename);
          console.log(`✅ 병합 이미지 저장 완료: ${filename}`);
        } catch (error) {
          console.error('❌ Electron API 저장 실패:', error);
          // fallback to browser download
          downloadMergedImage(mergedImageData, filename);
        }
      } else {
        // 브라우저 환경에서 다운로드
        downloadMergedImage(mergedImageData, filename);
      }
      
    } catch (error) {
      console.error('❌ 병합 이미지 저장 실패:', error);
    }
  };

  // 브라우저에서 이미지 다운로드
  const downloadMergedImage = (dataURL, filename) => {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`✅ 병합 이미지 다운로드 완료: ${filename}`);
  };

  // 사용자 정보 기반 폴더 경로 생성 함수
  const generateUserBasedPath = (judgeResult) => {
    const today = new Date();
    const workDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

    let userFolder;
    // 사용자 정보 확인
    if (!user) {
      // 로그인하지 않은 경우 undefined 폴더에 저장
      userFolder = 'undefined';
      console.warn('⚠️ 사용자 정보가 없어 undefined 폴더에 저장합니다.');
    } else {
      // 로그인한 경우 사용자 정보 기반 폴더 사용 (CSV 기반)
      const workerCode = user.birthLast4 || '0000'; // birth 끝 4자리
      const workerName = user.id || 'unknown'; // CSV의 id 값
      userFolder = `${workerCode}-${workerName}`;
      console.log(`👤 사용자 정보 - 코드: ${workerCode}, 이름: ${workerName}`);
    }

    const finalPath = `C:\\Inspect\\${userFolder}\\${workDate}\\${judgeResult}`;
    console.log(`📁 생성된 폴더 경로: ${finalPath}`);
    return finalPath;
  };

  // 마우스 위치 계산 함수
  const getMousePos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  // H 형태 선 그리기 및 정보 표시 함수 (캘리브레이션 값 적용)
  const drawLineWithInfo = (ctx, line, color, showText, calibrationValue = 19.8) => {
    const { x1, y1, x2, y2 } = line
    
    // ctx가 null이 아닐 때만 그리기 실행
    if (ctx) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      
      // 메인 선 그리기
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      
      // H 형태를 위한 수직선 길이 (8px 고정)
      const dx = x2 - x1
      const dy = y2 - y1
      const length = Math.sqrt(dx * dx + dy * dy)
      const perpLength = 14 // 8px 고정
      
      // 수직 방향 벡터 계산 (메인 선에 수직)
      const perpX = -dy / length * perpLength
      const perpY = dx / length * perpLength
      
      // 시작점 수직선
      ctx.beginPath()
      ctx.moveTo(x1 - perpX / 2, y1 - perpY / 2)
      ctx.lineTo(x1 + perpX / 2, y1 + perpY / 2)
      ctx.stroke()
      
      // 끝점 수직선
      ctx.beginPath()
      ctx.moveTo(x2 - perpX / 2, y2 - perpY / 2)
      ctx.lineTo(x2 + perpX / 2, y2 + perpY / 2)
      ctx.stroke()

      if (showText) {
        ctx.fillStyle = color
        ctx.font = '14px Arial'
        const mm = length / calibrationValue // 올바른 공식: 픽셀거리 / (px/mm) = mm
        let angle = Math.atan2(dy, dx) * 180 / Math.PI
        ctx.fillText(`${length.toFixed(1)}px / ${mm.toFixed(2)}mm (${angle.toFixed(1)}°)`, (x1 + x2) / 2 + 5, (y1 + y2) / 2 - 5)
      }
    }

    // 계산은 항상 수행 (ctx가 null이어도)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const mm = length / calibrationValue // 올바른 공식: 픽셀거리 / (px/mm) = mm
    let angle = Math.atan2(dy, dx) * 180 / Math.PI

    return { length: length.toFixed(1), mm: mm.toFixed(2), angle: angle.toFixed(2) }
  }

  // 기존 선의 모든 점에 스냅하는 함수
  const snapToExistingLines = (pos, lines, snapDistance = 15) => {
    let snappedPos = { ...pos }
    let minDistance = snapDistance
    
    lines.forEach(line => {
      // 선의 시작점과 끝점
      const dx = line.x2 - line.x1
      const dy = line.y2 - line.y1
      const lineLength = Math.sqrt(dx * dx + dy * dy)
      
      if (lineLength === 0) return // 길이가 0인 선은 무시
      
      // 마우스 위치에서 선까지의 가장 가까운 점 계산
      const t = Math.max(0, Math.min(1, ((pos.x - line.x1) * dx + (pos.y - line.y1) * dy) / (lineLength * lineLength)))
      const closestX = line.x1 + t * dx
      const closestY = line.y1 + t * dy
      
      // 가장 가까운 점까지의 거리 계산
      const distance = Math.sqrt(Math.pow(pos.x - closestX, 2) + Math.pow(pos.y - closestY, 2))
      
      // 스냅 거리 내에 있으면 스냅
      if (distance < minDistance) {
        snappedPos = { x: closestX, y: closestY }
        minDistance = distance
      }
    })
    
    return snappedPos
  }

  // 각도 스냅 함수
  const snapAngle = (startPos, currentPos) => {
    const dx = currentPos.x - startPos.x
    const dy = currentPos.y - startPos.y
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    const snapThreshold = 5

    let endX = currentPos.x
    let endY = currentPos.y

    // 0도, 180도 (수평선)
    if (Math.abs(angle) < snapThreshold || Math.abs(Math.abs(angle) - 180) < snapThreshold) {
      endY = startPos.y
    }
    // 90도, -90도 (수직선)
    else if (Math.abs(Math.abs(angle) - 90) < snapThreshold) {
      endX = startPos.x
    }

    return { x: endX, y: endY }
  }

  // 선 클릭 감지 함수
  const isPointOnLine = (point, line, tolerance = 10) => {
    const { x1, y1, x2, y2 } = line
    const { x, y } = point

    // 선분의 길이
    const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (lineLength === 0) return false

    // 점에서 선분까지의 거리 계산
    const distance = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / lineLength

    // 점이 선분의 범위 내에 있는지 확인
    const dotProduct = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (lineLength ** 2)
    const isInRange = dotProduct >= 0 && dotProduct <= 1

    return distance <= tolerance && isInRange
  }

  // Camera 1 핸들러들
  const handlers1 = {
    handleMouseDown: (e) => {
      const pos = getMousePos(canvasRef1.current, e)
      
      if (drawMode1) {
        setStartPoint1(pos)
        setIsDrawing1(true)
        return
      }

      // 선 클릭 감지
      for (let i = lines1.length - 1; i >= 0; i--) {
        if (isPointOnLine(pos, lines1[i])) {
          setSelectedIndex1(i)
          const lineData = drawLineWithInfo(null, lines1[i], lines1[i].color || 'red', false, calibrationValue1)
          setLineInfo1(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`)
          redrawCanvas1()
          return
        }
      }
      setSelectedIndex1(-1)
      setLineInfo1('선 정보: 없음')
      redrawCanvas1()
    },
    handleMouseMove: (e) => {
      if (!drawMode1 || !isDrawing1 || !startPoint1) return
      
      const currentPos = getMousePos(canvasRef1.current, e)
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines1)
      const snappedPos = snapAngle(startPoint1, lineSnappedPos)
      
      const canvas = canvasRef1.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 기존 선들 그리기
      drawLines(ctx, lines1, selectedIndex1, calibrationValue1)
      
      // 임시 선 그리기 (H 형태)
      const tempLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y }
      drawLineWithInfo(ctx, tempLine, selectedLineColor1, true, calibrationValue1)
      
      // 스냅 포인트 표시 (작은 원으로 표시)
      if (lineSnappedPos.x !== currentPos.x || lineSnappedPos.y !== currentPos.y) {
        ctx.beginPath()
        ctx.arc(snappedPos.x, snappedPos.y, 4, 0, 2 * Math.PI)
        ctx.fillStyle = 'yellow'
        ctx.fill()
        ctx.strokeStyle = 'orange'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    },
    handleMouseUp: (e) => {
      if (!drawMode1 || !isDrawing1 || !startPoint1) return
      
      const currentPos = getMousePos(canvasRef1.current, e)
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines1)
      const snappedPos = snapAngle(startPoint1, lineSnappedPos)
      
      const newLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y, color: selectedLineColor1 }
      const newLines = [...lines1, newLine]
      setLines1(newLines)
      
      setIsDrawing1(false)
      setStartPoint1(null)
      setDrawMode1(false)
      setSelectedIndex1(newLines.length - 1)
      
      const lineData = drawLineWithInfo(null, newLine, selectedLineColor1, false, calibrationValue1)
      setLineInfo1(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`)
    },
    handleDeleteLine: () => {
      if (selectedIndex1 >= 0 && selectedIndex1 < lines1.length) {
        const newLines = lines1.filter((_, index) => index !== selectedIndex1)
        setLines1(newLines)
        setSelectedIndex1(-1)
        setLineInfo1('선 정보: 없음')
        redrawCanvas1()
      }
    }
  }

  // Camera 2 핸들러들
  const handlers2 = {
    handleMouseDown: (e) => {
      const pos = getMousePos(canvasRef2.current, e)
      
      if (drawMode2) {
        setStartPoint2(pos)
        setIsDrawing2(true)
        return
      }

      // 선 클릭 감지
      for (let i = lines2.length - 1; i >= 0; i--) {
        if (isPointOnLine(pos, lines2[i])) {
          setSelectedIndex2(i)
          const lineData = drawLineWithInfo(null, lines2[i], lines2[i].color || 'red', false, calibrationValue2)
          setLineInfo2(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`)
          redrawCanvas2()
          return
        }
      }
      setSelectedIndex2(-1)
      setLineInfo2('선 정보: 없음')
      redrawCanvas2()
    },
    handleMouseMove: (e) => {
      if (!drawMode2 || !isDrawing2 || !startPoint2) return
      
      const currentPos = getMousePos(canvasRef2.current, e)
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines2)
      const snappedPos = snapAngle(startPoint2, lineSnappedPos)
      
      const canvas = canvasRef2.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 기존 선들 그리기
      drawLines(ctx, lines2, selectedIndex2, calibrationValue2)
      
      // 임시 선 그리기 (H 형태)
      const tempLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y }
      drawLineWithInfo(ctx, tempLine, selectedLineColor2, true, calibrationValue2)
      
      // 스냅 포인트 표시 (작은 원으로 표시)
      if (lineSnappedPos.x !== currentPos.x || lineSnappedPos.y !== currentPos.y) {
        ctx.beginPath()
        ctx.arc(snappedPos.x, snappedPos.y, 4, 0, 2 * Math.PI)
        ctx.fillStyle = 'yellow'
        ctx.fill()
        ctx.strokeStyle = 'orange'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    },
    handleMouseUp: (e) => {
      if (!drawMode2 || !isDrawing2 || !startPoint2) return
      
      const currentPos = getMousePos(canvasRef2.current, e)
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines2)
      const snappedPos = snapAngle(startPoint2, lineSnappedPos)
      
      const newLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y, color: selectedLineColor2 }
      const newLines = [...lines2, newLine]
      setLines2(newLines)
      
      setIsDrawing2(false)
      setStartPoint2(null)
      setDrawMode2(false)
      setSelectedIndex2(newLines.length - 1)
      
      const lineData = drawLineWithInfo(null, newLine, selectedLineColor2, false, calibrationValue2)
      setLineInfo2(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`)
    },
    handleDeleteLine: () => {
      if (selectedIndex2 >= 0 && selectedIndex2 < lines2.length) {
        const newLines = lines2.filter((_, index) => index !== selectedIndex2)
        setLines2(newLines)
        setSelectedIndex2(-1)
        setLineInfo2('선 정보: 없음')
        redrawCanvas2()
      }
    }
  }

  // 선 그리기 헬퍼 함수 (캘리브레이션 값 적용)
  const drawLines = (ctx, lines, selectedIndex, calibrationValue) => {
    lines.forEach((line, index) => {
      const isSelected = index === selectedIndex
      const lineColor = isSelected ? 'cyan' : (line.color || 'red') // 저장된 색상 사용, 기본값은 빨간색
      drawLineWithInfo(ctx, line, lineColor, true, calibrationValue)
    })
  }

  // 캔버스 다시 그리기 함수들
  const redrawCanvas1 = () => {
    const canvas = canvasRef1.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLines(ctx, lines1, selectedIndex1, calibrationValue1)
  }

  const redrawCanvas2 = () => {
    const canvas = canvasRef2.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLines(ctx, lines2, selectedIndex2, calibrationValue2)
  }

  // 캔버스 리사이즈 함수
  const resizeCanvas = (canvas, container) => {
    if (canvas && container) {
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
    }
  }

  const resizeAll = () => {
    resizeCanvas(canvasRef1.current, videoContainerRef1.current)
    resizeCanvas(canvasRef2.current, videoContainerRef2.current)
    
    redrawCanvas1()
    redrawCanvas2()
  }

  // START/STOP 버튼 클릭 핸들러 - DataSettingsPanel에서 EEPROM 로직 처리
  const handleStartStopClick = () => {
    const nextStartedState = !isStarted;
    setIsStarted(nextStartedState);

    if (nextStartedState) {
      // START 버튼 클릭 시: DataSettingsPanel에서 MTR 버전/국가 정보와 함께 EEPROM 읽기 처리
      console.log("🚀 START 버튼 클릭 - DataSettingsPanel에서 EEPROM 처리");
      // START 시 상태 변경 제거 - EEPROM 쓰기 완료 시에만 상태 변경
    } else {
      // STOP 버튼 클릭 시: 데이터 초기화
      console.log("🛑 STOP 버튼 클릭 - EEPROM 데이터 초기화");
      setReadEepromData(null);
      setWorkStatus('waiting');
    }
  };

  useEffect(() => {
    redrawCanvas1()
  }, [lines1, selectedIndex1, calibrationValue1])

  useEffect(() => {
    redrawCanvas2()
  }, [lines2, selectedIndex2, calibrationValue2])

  // 모터 WebSocket 연결 및 자동 연결
  useEffect(() => {
    console.log('🔧 모터 WebSocket 연결 시도...')
    const socket = new WebSocket("ws://192.168.0.114:8765")

    socket.onopen = () => {
      console.log("✅ 모터 WebSocket 연결 성공")
      setIsWsConnected(true)
      setMotorError(null)
      
      // WebSocket 연결 후 자동으로 모터 연결 시도
      setTimeout(() => {
        connectMotor(socket)
      }, 1000)
    }

    socket.onclose = () => {
      console.log("❌ 모터 WebSocket 연결 끊김")
      setIsWsConnected(false)
      setIsMotorConnected(false)
      setMotorError("WebSocket 연결이 끊어졌습니다.")
    }

    socket.onerror = (err) => {
      console.error("❌ 모터 WebSocket 오류:", err)
      setMotorError("WebSocket 연결 오류가 발생했습니다.")
    }

    socket.onmessage = (e) => {
      try {
        const res = JSON.parse(e.data)

        if (res.type === "serial") {
          if (res.result.includes("성공") || 
              res.result.includes("완료") || 
              res.result.includes("전송 완료")) {
            setIsMotorConnected(true)
            setMotorError(null)
          } else if (res.result.includes("실패") || 
                     res.result.includes("오류")) {
            console.error("❌ 모터 연결 실패:", res.result)
            setIsMotorConnected(false)
            setMotorError(res.result)
          } else {
            // 만약 모터가 이미 연결되어 있고 명령이 정상 처리되면 연결 상태 유지
            if (isMotorConnected && res.result && !res.result.includes("실패") && !res.result.includes("오류")) {
              // 연결 상태 유지
            }
          }
        } else if (res.type === "status") {
          // 상태 업데이트 (모터 + GPIO + EEPROM + 저항)
          const { position, gpio18, gpio23, needle_tip_connected, eeprom, 
                  resistance1, resistance2, resistance1_status, resistance2_status,
                  motor_connected } = res.data
          setCurrentPosition(position)
          
          // 저항값 상태 업데이트
          if (resistance1 !== undefined) setResistance1(resistance1)
          if (resistance2 !== undefined) setResistance2(resistance2)
          if (resistance1_status) setResistance1Status(resistance1_status)
          if (resistance2_status) setResistance2Status(resistance2_status)
          
          // 모터 연결 상태 업데이트
          if (typeof motor_connected === 'boolean') {
            setIsMotorConnected(motor_connected)
          }
          
          // 니들 위치를 기본 'UP'으로 설정 (하드코딩 제거)
          // 실제 위치와 관계없이 항상 UP 상태로 처리
          setNeedlePosition('UP')
          
          // GPIO23 기반 니들팁 연결 상태 업데이트
          if (typeof needle_tip_connected === 'boolean') {
            setNeedleTipConnected(needle_tip_connected)
          }
          
          // EEPROM 데이터 자동 처리 제거 - START/STOP 버튼으로만 제어
          // 기존 코드가 WebSocket 응답마다 EEPROM 데이터를 초기화하여 문제 발생
          if (eeprom && eeprom.success) {
            // EEPROM 데이터 수신 감지 (자동 처리 비활성화)
          }
          
          // GPIO 18번 상태 업데이트 및 토글 감지
          if (gpio18 && gpio18 !== "UNKNOWN") {
            const prevGpioState = prevGpioRef.current // useRef로 이전 상태 가져오기
            
            // GPIO 상태가 변경되었을 때 토글 실행 (HIGH↔LOW 변화)
            if (prevGpioState !== gpio18) {
              handleAutoToggle()
            }
            
            // 상태 업데이트 (즉시 반영)
            prevGpioRef.current = gpio18
            setGpioState(gpio18)
          }
        // EEPROM 관련 메시지는 DataSettingsPanel에서 Promise 기반으로 직접 처리
        // 중복 처리 방지를 위해 메인 UI에서는 제거
        } else if (res.type === "error") {
          console.error("❌ 모터 오류:", res.result)
          setMotorError(res.result)
        }
      } catch (err) {
        console.error("❌ 모터 메시지 파싱 오류:", err)
      }
    }

    setWs(socket)

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        console.log("🔧 모터 포트 닫기 및 WebSocket 연결 종료...")
        socket.send(JSON.stringify({ cmd: "disconnect" }))
        setTimeout(() => {
          socket.close()
          console.log("✅ 모터 연겴 정리 완료")
        }, 500)
      }
    }
  }, [])

  // 앱 종료 시 정리 (window beforeunload 이벤트)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("🔧 앱 종료 - 모터 포트 닫기...")
        ws.send(JSON.stringify({ cmd: "disconnect" }))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [ws])

  // 모터 자동 연결 함수
  const connectMotor = (socket) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket이 연결되지 않았습니다.")
      setMotorError("WebSocket이 연결되지 않았습니다.")
      return
    }

    const msg = {
      cmd: "connect",
      port: MOTOR_CONFIG.device,
      baudrate: MOTOR_CONFIG.baudrate,
      parity: MOTOR_CONFIG.parity,
      databits: MOTOR_CONFIG.dataBits,
      stopbits: MOTOR_CONFIG.stopBits,
    }

    console.log("🔧 모터 자동 연결 시도:", msg)
    socket.send(JSON.stringify(msg))
  }

  // 니들 위치 제어 함수
  const handleNeedlePosition = (targetPosition) => {
    console.log("🔍 handleNeedlePosition 호출 - 목표 위치:", targetPosition)
    console.log("🔍 연결 상태 - WebSocket:", ws?.readyState, "Motor:", isMotorConnected)
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket이 연결되지 않았습니다.")
      setMotorError("WebSocket이 연결되지 않았습니다.")
      return
    }

    const msg = {
      cmd: "move",
      position: targetPosition,
      mode: "position",
    }

    console.log(`🎯 니들 ${targetPosition > 0 ? 'UP' : 'DOWN'} 명령 전송:`, msg)
    ws.send(JSON.stringify(msg))
    setMotorError(null)
  }

  // 니들 UP 함수
  const handleNeedleUp = () => {
    handleNeedlePosition(calculatedMotorPosition)
  }

  // 니들 DOWN 함수
  const handleNeedleDown = () => {
    handleNeedlePosition(0);
  }

  // 판정 후 상태 초기화 함수 (동기 로직으로 단순화)
  const handleJudgeReset = () => {
    console.log('🔄 판정 후 상태 초기화 시작');
    
    // 1. EEPROM UI 데이터 초기화
    setReadEepromData(null);
    console.log('✅ EEPROM UI 데이터 초기화 완료');
    
    // 2. EEPROM 읽기 대기 상태 초기화
    setIsWaitingEepromRead(false);
    console.log('✅ EEPROM 읽기 대기 상태 초기화 완료');
    
    // 3. START/STOP 상태 초기화 (STOP 상태로 변경)
    setIsStarted(false);
    console.log('✅ START/STOP 상태 초기화 완료');
    
    // 4. 작업 상태를 대기로 변경 (판정 후 정상 흐름)
    setWorkStatus('waiting');
    console.log('✅ 작업 상태 초기화 완료 (판정 후 대기 상태)');
    
    console.log('🎉 판정 후 상태 초기화 완료 - 동기 로직으로 race condition 해결');
  };

  // 기존 handleStartStopClick 함수 제거 - 새로운 함수로 대체됨

  // GPIO 18번 자동 토글 함수 (모터 상태 기반 반대 명령)
  const handleAutoToggle = () => {
    console.log("🔄 GPIO 토글 감지 - 모터 상태 기반 명령 전송!")
    console.log("🔍 디버그 정보 - currentPosition:", currentPosition, "needlePosition:", needlePosition)
    
    // MOVING 상태 확인
    if (needlePosition === 'MOVING') {
      console.log("⚠️ 니들이 이동 중 - 자동 명령 대기")
      return
    }

    // 현재 모터 상태에 따라 반대 명령 결정
    let targetPosition
    let commandDirection
    
    // 현재 위치 기반으로 반대 명령 결정 (하드코딩 제거)
    if (currentPosition <= 50) {
      // 현재 DOWN 위치 → UP 명령 (현재 위치 + 800)
      targetPosition = currentPosition + 800
      commandDirection = 'UP'
      console.log("✅ DOWN 위치 감지 - UP 명령 준비")
    } else {
      // 현재 UP 위치 → DOWN 명령 (0으로 이동)
      targetPosition = 0
      commandDirection = 'DOWN'
      console.log("✅ UP 위치 감지 - DOWN 명령 준비")
    }
    
    console.log(`🎯 모터 상태: ${needlePosition} (position: ${currentPosition}) → ${commandDirection} 명령 (위치: ${targetPosition})`)

    // 직접 모터 명령 WebSocket 생성
    console.log("🔗 모터 명령용 WebSocket 연결 생성...")
    const autoSocket = new WebSocket('ws://192.168.0.114:8765')
    
    autoSocket.onopen = () => {
      console.log("✅ 모터 명령용 WebSocket 연결 성공")
      
      // 백엔드 cmd: "move" 명령 사용
      const command = { 
        cmd: 'move',
        mode: 'servo',
        position: targetPosition
      }
      // 얌얌얌
      console.log(`📦 전송할 명령:`, JSON.stringify(command))
      autoSocket.send(JSON.stringify(command))
      
      console.log(`🚀 GPIO 자동 명령 전송 완료: ${commandDirection} (위치: ${targetPosition})`)
      
      // 명령 전송 후 연결 종료
      setTimeout(() => {
        autoSocket.close()
        console.log("🔗 모터 명령용 WebSocket 연결 종료")
      }, 1000)
    }
    
    autoSocket.onerror = (err) => {
      console.error("❌ 모터 명령용 WebSocket 연결 실패:", err)
    }
    
    autoSocket.onclose = () => {
      console.log("🔗 모터 명령용 WebSocket 연결 종료됨")
    }
  }

  useEffect(() => {
    const img1 = document.querySelector('#camera-feed-1 img')
    const img2 = document.querySelector('#camera-feed-2 img')

    window.addEventListener('resize', resizeAll)
    if (img1) img1.addEventListener('load', resizeAll)
    if (img2) img2.addEventListener('load', resizeAll)

    setTimeout(resizeAll, 100)

    return () => {
      window.removeEventListener('resize', resizeAll)
      if (img1) img1.removeEventListener('load', resizeAll)
      if (img2) img2.removeEventListener('load', resizeAll)
    }
  }, [])

  return (
    <div className="bg-[#000000] min-h-screen text-white font-sans p-4 flex flex-col gap-4">
      {/* 모터 연결 상태 표시 */}
      <div style={{
        position: 'fixed',
        top: '520px',
        right: '20px',
        zIndex: 1000
      }}>
        <div style={{
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: isMotorConnected ? '#d4edda' : '#f8d7da',
          color: isMotorConnected ? '#155724' : '#721c24',
          border: `1px solid ${isMotorConnected ? '#c3e6cb' : '#f5c6cb'}`,
          textAlign: 'center'
        }}>
          모터: {isMotorConnected ? '연결됨' : '연결 안됨'}
          <div style={{ fontSize: '10px', marginTop: '2px' }}>
            위치: {currentPosition} | 니들: {needlePosition}
          </div>
          <div style={{ fontSize: '10px', marginTop: '2px' }}>
            GPIO 18: {gpioState}
          </div>
          {/* GPIO23 기반 니들팁 연결 상태 표시 */}
          <div style={{ 
            fontSize: '10px', 
            marginTop: '2px', 
            borderTop: '1px solid rgba(0,0,0,0.1)', 
            paddingTop: '2px',
            color: needleTipConnected ? '#155724' : '#721c24',
            fontWeight: 'bold'
          }}>
            {needleTipConnected ? '✅ 니들팁 연결됨 (GPIO23 LOW)' : '🚫 니들팁 없음 (GPIO23 HIGH)'}
          </div>
          {readEepromData && (
            <>
              <div style={{ fontSize: '9px', marginTop: '1px' }}>
                TIP: {readEepromData.tipType} | SHOT: {readEepromData.shotCount}
              </div>
              <div style={{ fontSize: '9px', marginTop: '1px' }}>
                DATE: {readEepromData.year}-{String(readEepromData.month).padStart(2, '0')}-{String(readEepromData.day).padStart(2, '0')}
              </div>
              <div style={{ fontSize: '9px', marginTop: '1px' }}>
                MAKER: {readEepromData.makerCode}
              </div>
            </>
          )}
          {motorError && (
            <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>
              {motorError}
            </div>
          )}
        </div>
      </div>
      
      <main className="flex flex-col flex-1 gap-4 overflow-hidden">
        {/* Top Camera Views */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[60vh]">
          <CameraView 
            title="Camera 1" 
            cameraId={1}
            videoServerUrl={videoServerUrl}
            videoEndpoint="/video"
            drawMode={drawMode1}
            onDrawModeToggle={() => setDrawMode1(!drawMode1)}
            onDeleteLine={handlers1.handleDeleteLine}
            selectedIndex={selectedIndex1}
            lineInfo={lineInfo1}
            handlers={handlers1}
            canvasRef={canvasRef1}
            videoContainerRef={videoContainerRef1}
            calibrationValue={calibrationValue1}
            onCalibrationChange={setCalibrationValue1}
            selectedLineColor={selectedLineColor1}
            onLineColorChange={setSelectedLineColor1}
            ref={cameraViewRef1} // CameraView ref 추가
          />
          <CameraView 
            title="Camera 2" 
            cameraId={2}
            videoServerUrl={videoServerUrl}
            videoEndpoint="/video2"
            drawMode={drawMode2}
            onDrawModeToggle={() => setDrawMode2(!drawMode2)}
            onDeleteLine={handlers2.handleDeleteLine}
            selectedIndex={selectedIndex2}
            lineInfo={lineInfo2}
            handlers={handlers2}
            canvasRef={canvasRef2}
            videoContainerRef={videoContainerRef2}
            calibrationValue={calibrationValue2}
            onCalibrationChange={setCalibrationValue2}
            selectedLineColor={selectedLineColor2}
            onLineColorChange={setSelectedLineColor2}
            ref={cameraViewRef2} // CameraView ref 추가
          />
        </div>

        {/* Bottom Control Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1 min-h-0 overflow-y-auto">
          <StatusPanel mode={mode} workStatus={workStatus} needleTipConnected={needleTipConnected} isWaitingEepromRead={isWaitingEepromRead} />
          <DataSettingsPanel 
            makerCode={makerCode} 
            onWorkStatusChange={setWorkStatus}
            isStarted={isStarted}
            onStartedChange={handleStartStopClick} // START/STOP 상태 변경
            readEepromData={readEepromData}
            onReadEepromDataChange={setReadEepromData}
            needleTipConnected={needleTipConnected}
            websocket={ws} // WebSocket 연결 전달
            isWsConnected={isWsConnected} // WebSocket 연결 상태 전달
            onWaitingEepromReadChange={setIsWaitingEepromRead} // EEPROM 읽기 대기 상태 변경 함수 전달
            calculatedMotorPosition={calculatedMotorPosition} // 계산된 모터 위치 전달
          />
          <NeedleCheckPanel 
            mode={mode} 
            isMotorConnected={isMotorConnected}
            needlePosition={needlePosition}
            onNeedleUp={handleNeedleUp}
            onNeedleDown={handleNeedleDown}
            websocket={ws}
            isWsConnected={isWsConnected}
            onMotorPositionChange={setCalculatedMotorPosition}
            resistance1={resistance1}
            resistance2={resistance2}
            resistance1Status={resistance1Status}
            resistance2Status={resistance2Status}
          />
          <JudgePanel 
            onJudge={(result) => console.log(`판정 결과: ${result}`)}
            isStarted={isStarted}
            onReset={handleJudgeReset}
            camera1Ref={cameraViewRef1} // camera1Ref 전달
            camera2Ref={cameraViewRef2} // camera2Ref 전달
            hasNeedleTip={needleTipConnected} // GPIO23 기반 니들팁 연결 상태 전달
            websocket={ws} // WebSocket 연결 전달
            isWsConnected={isWsConnected} // WebSocket 연결 상태 전달
            onCaptureMergedImage={captureMergedImage} // 병합 캡처 함수 전달
            eepromData={readEepromData} // EEPROM 데이터 전달
            generateUserBasedPath={generateUserBasedPath} // 사용자 기반 폴더 경로 생성 함수 전달
            isWaitingEepromRead={isWaitingEepromRead} // EEPROM 읽기 대기 상태 전달
            onWaitingEepromReadChange={setIsWaitingEepromRead} // EEPROM 읽기 대기 상태 변경 함수 전달
          />
        </div>
      </main>
      <footer className="text-right text-xs text-gray-400 pr-2">SAVE MODE v1</footer>
    </div>
  )
}
