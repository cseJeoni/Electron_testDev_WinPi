"""
P3010-2 저항 측정 모듈 (WebSocket 서버 통합용)
resistance_monitor.py 기반으로 작성됨
pymodbus==3.6.8 사용
"""

import time
import asyncio
from pymodbus.client import ModbusSerialClient
from typing import Optional, Dict, Any

class ResistanceMonitor:
    """P3010-2 저항 측정기 제어 클래스"""
    
    def __init__(self, port='/dev/usb-resistance'):
        """
        초기화
        Args:
            port: 시리얼 포트 이름 (기본값: /dev/usb-resistance)
        """
        # Modbus 설정 (P3010-2 사양)
        self.port = port
        self.baudrate = 9600
        self.parity = 'N'
        self.stopbits = 1
        self.bytesize = 8
        self.timeout = 0.5  # 0.5초 타임아웃 (웹소켓 주기를 고려)
        
        # Slave ID 설정
        self.slave_id_1 = 1  # 첫 번째 저항 측정기
        self.slave_id_2 = 2  # 두 번째 저항 측정기
        
        # Register 정보
        self.resistance_address = 0
        self.register_count = 1
        
        # 클라이언트 초기화
        self.client = None
        self.is_connected = False
        
        # 재연결 관련
        self.retry_count = 0
        self.max_retries = 3
        self.retry_delay = 1.0  # 재연결 시도 간격 (초)
        
        # 마지막 측정값 캐시 (통신 실패 시 이전 값 유지)
        self.last_values = {
            'resistance1': None,
            'resistance2': None,
            'status1': 'N/A',
            'status2': 'N/A'
        }
        
        # 에러 카운터 (연속 에러 추적)
        self.error_count = 0
        self.max_error_count = 5  # 5회 연속 에러 시 재연결 시도
    
    def connect(self) -> bool:
        """
        Modbus 시리얼 연결
        Returns:
            bool: 연결 성공 여부
        """
        try:
            # 기존 연결이 있으면 먼저 종료
            if self.client and self.client.is_open:
                self.client.close()
            
            # 새 클라이언트 생성
            self.client = ModbusSerialClient(
                port=self.port,
                baudrate=self.baudrate,
                parity=self.parity,
                stopbits=self.stopbits,
                bytesize=self.bytesize,
                timeout=self.timeout
            )
            
            # 연결 시도
            if self.client.connect():
                self.is_connected = True
                self.retry_count = 0
                self.error_count = 0
                print(f"[ResistanceMonitor] 연결 성공: {self.port}")
                return True
            else:
                self.is_connected = False
                print(f"[ResistanceMonitor] 연결 실패: {self.port}")
                return False
                
        except Exception as e:
            self.is_connected = False
            print(f"[ResistanceMonitor] 연결 오류: {e}")
            return False
    
    async def connect_with_retry(self) -> bool:
        """
        재시도 로직을 포함한 비동기 연결
        Returns:
            bool: 최종 연결 성공 여부
        """
        for i in range(self.max_retries):
            if self.connect():
                return True
            
            if i < self.max_retries - 1:
                print(f"[ResistanceMonitor] 재연결 시도 {i+1}/{self.max_retries}...")
                await asyncio.sleep(self.retry_delay)
        
        print(f"[ResistanceMonitor] 최대 재시도 횟수 초과")
        return False
    
    def read_resistance(self, slave_id: int) -> Optional[int]:
        """
        특정 Slave ID에서 저항값 읽기
        Args:
            slave_id: Modbus Slave ID (1 또는 2)
        Returns:
            int: 저항값 (Ohm) 또는 None (실패)
        """
        if not self.is_connected or not self.client:
            return None
        
        try:
            # Holding Register 읽기
            response = self.client.read_holding_registers(
                address=self.resistance_address,
                count=self.register_count,
                slave=slave_id
            )
            
            if not response.isError() and response.registers:
                self.error_count = 0  # 성공 시 에러 카운터 리셋
                return response.registers[0]
            else:
                return None
                
        except Exception as e:
            print(f"[ResistanceMonitor] Slave {slave_id} 읽기 오류: {e}")
            return None
    
    async def read_all_resistances(self) -> Dict[str, Any]:
        """
        모든 저항값을 비동기로 읽기
        Returns:
            dict: 저항값 및 상태 정보
        """
        result = {
            'resistance1': None,
            'resistance2': None,
            'status1': 'ERROR',
            'status2': 'ERROR',
            'connected': self.is_connected
        }
        
        # 연결되지 않았으면 재연결 시도
        if not self.is_connected:
            # 백그라운드에서 재연결 시도 (블로킹하지 않음)
            asyncio.create_task(self.connect_with_retry())
            
            # 캐시된 값 반환
            result['resistance1'] = self.last_values['resistance1']
            result['resistance2'] = self.last_values['resistance2']
            result['status1'] = 'DISCONNECTED'
            result['status2'] = 'DISCONNECTED'
            return result
        
        # 첫 번째 저항 측정기 읽기
        value1 = self.read_resistance(self.slave_id_1)
        if value1 is not None:
            result['resistance1'] = value1
            result['status1'] = 'OK'
            self.last_values['resistance1'] = value1
            self.last_values['status1'] = 'OK'
        else:
            result['resistance1'] = self.last_values['resistance1']
            result['status1'] = self.last_values['status1']
            self.error_count += 1
        
        # 두 번째 저항 측정기 읽기
        value2 = self.read_resistance(self.slave_id_2)
        if value2 is not None:
            result['resistance2'] = value2
            result['status2'] = 'OK'
            self.last_values['resistance2'] = value2
            self.last_values['status2'] = 'OK'
        else:
            result['resistance2'] = self.last_values['resistance2']
            result['status2'] = self.last_values['status2']
            self.error_count += 1
        
        # 연속 에러가 많으면 재연결 시도
        if self.error_count >= self.max_error_count:
            print(f"[ResistanceMonitor] 연속 {self.error_count}회 에러 발생, 재연결 시도...")
            self.is_connected = False
            self.error_count = 0
            asyncio.create_task(self.connect_with_retry())
        
        return result
    
    def close(self):
        """연결 종료"""
        if self.client and self.client.is_open:
            self.client.close()
            print("[ResistanceMonitor] 연결 종료")
        self.is_connected = False

# 웹소켓 서버용 전역 인스턴스
resistance_monitor = None

def init_resistance_monitor(port='/dev/usb-resistance'):
    """
    저항 모니터 초기화 (웹소켓 서버에서 호출)
    Args:
        port: 시리얼 포트 이름
    Returns:
        ResistanceMonitor: 초기화된 인스턴스
    """
    global resistance_monitor
    resistance_monitor = ResistanceMonitor(port)
    
    # 초기 연결 시도
    if resistance_monitor.connect():
        print("[ResistanceMonitor] 초기화 성공")
    else:
        print("[ResistanceMonitor] 초기화 실패 - 백그라운드에서 재연결 시도")
    
    return resistance_monitor

async def get_resistance_values():
    """
    현재 저항값 가져오기 (웹소켓 서버에서 호출)
    Returns:
        dict: 저항값 및 상태 정보
    """
    if resistance_monitor:
        return await resistance_monitor.read_all_resistances()
    else:
        return {
            'resistance1': None,
            'resistance2': None,
            'status1': 'NOT_INITIALIZED',
            'status2': 'NOT_INITIALIZED',
            'connected': False
        }

def close_resistance_monitor():
    """저항 모니터 종료 (웹소켓 서버 종료 시 호출)"""
    global resistance_monitor
    if resistance_monitor:
        resistance_monitor.close()
        resistance_monitor = None
        print("[ResistanceMonitor] 정리 완료")

# 테스트용 코드 (직접 실행 시)
if __name__ == "__main__":
    async def test_monitor():
        """테스트 함수"""
        monitor = ResistanceMonitor()
        
        if await monitor.connect_with_retry():
            print("테스트 시작...")
            
            for i in range(10):
                values = await monitor.read_all_resistances()
                print(f"\r저항1: {values['resistance1']}Ω ({values['status1']}) | "
                      f"저항2: {values['resistance2']}Ω ({values['status2']}) | "
                      f"연결: {values['connected']}", end="")
                await asyncio.sleep(0.5)
            
            monitor.close()
        else:
            print("연결 실패")
    
    # 테스트 실행
    asyncio.run(test_monitor())
