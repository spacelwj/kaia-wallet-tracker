const fetch = require('node-fetch');

// 환경변수에서 설정값 가져오기
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const KAIA_WALLET_ADDRESS = process.env.KAIA_WALLET_ADDRESS;

// API 엔드포인트
const KAIA_RPC_ENDPOINTS = [
  'https://public-en-cypress.klaytn.net',
  'https://rpc.ankr.com/klaytn',
  'https://klaytn-mainnet.gateway.tatum.io'
];
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// 토큰 정보 매핑
const TOKEN_INFO = {
  KAIA: {
    coingecko_id: 'kaia',
    decimals: 18,
    symbol: 'KAIA'
  }
};

// 카이아 체인 잔액 조회
async function getKaiaBalance(address) {
  for (const endpoint of KAIA_RPC_ENDPOINTS) {
    try {
      console.log(`카이아 잔액 조회 중... (${endpoint})`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'klay_getBalance',
          params: [address, 'latest'],
          id: 1
        })
      });
      
      const data = await response.json();
      
      if (data.result) {
        // 16진수 결과를 10진수로 변환하고 Wei에서 KAIA로 변환
        const balanceInWei = BigInt(data.result);
        const balanceInKaia = Number(balanceInWei) / Math.pow(10, 18);
        console.log(`잔액 조회 성공: ${balanceInKaia} KAIA`);
        return balanceInKaia;
      }
    } catch (error) {
      console.log(`엔드포인트 ${endpoint} 실패:`, error.message);
    }
  }
  
  console.error('모든 카이아 RPC 엔드포인트 실패');
  return 0;
}

// 토큰 가격 조회
async function getTokenPrice(coingeckoId) {
  try {
    const response = await fetch(`${COINGECKO_API}/simple/price?ids=${coingeckoId}&vs_currencies=usd,krw`);
    const data = await response.json();
    return {
      usd: data[coingeckoId]?.usd || 0,
      krw: data[coingeckoId]?.krw || 0
    };
  } catch (error) {
    console.error('토큰 가격 조회 실패:', error);
    return { usd: 0, krw: 0 };
  }
}

// 노션 데이터베이스에 데이터 추가
async function addToNotion(data) {
  try {
    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: {
          database_id: NOTION_DATABASE_ID
        },
        properties: {
          '날짜': {
            title: [
              {
                text: {
                  content: data.date
                }
              }
            ]
          },
          '체인': {
            rich_text: [
              {
                text: {
                  content: data.chain
                }
              }
            ]
          },
          '토큰': {
            rich_text: [
              {
                text: {
                  content: data.token
                }
              }
            ]
          },
          '보유량': {
            number: data.balance
          },
          '가격USD': {
            number: data.priceUsd
          },
          '가격KRW': {
            number: data.priceKrw
          },
          '총가치USD': {
            number: data.totalValueUsd
          },
          '총가치KRW': {
            number: data.totalValueKrw
          },
          '지갑주소': {
            rich_text: [
              {
                text: {
                  content: data.walletAddress
                }
              }
            ]
          }
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`노션 API 오류: ${response.status} - ${errorData}`);
    }
    
    console.log(`✅ 노션에 데이터 추가 완료: ${data.chain} ${data.token}`);
  } catch (error) {
    console.error('❌ 노션 데이터 추가 실패:', error);
    throw error;
  }
}

// 메인 함수
async function main() {
  console.log('🚀 카이아 지갑 잔액 추적 시작...');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 날짜: ${today}`);
    
    // 카이아 체인 처리
    if (KAIA_WALLET_ADDRESS) {
      console.log('💰 카이아 잔액 조회 중...');
      const kaiaBalance = await getKaiaBalance(KAIA_WALLET_ADDRESS);
      const kaiaPrice = await getTokenPrice(TOKEN_INFO.KAIA.coingecko_id);
      
      const kaiaData = {
        date: today,
        chain: 'Kaia',
        token: 'KAIA',
        balance: kaiaBalance,
        priceUsd: kaiaPrice.usd,
        priceKrw: kaiaPrice.krw,
        totalValueUsd: kaiaBalance * kaiaPrice.usd,
        totalValueKrw: kaiaBalance * kaiaPrice.krw,
        walletAddress: KAIA_WALLET_ADDRESS
      };
      
      console.log('📊 카이아 데이터:', {
        balance: `${kaiaData.balance} KAIA`,
        priceUSD: `${kaiaData.priceUsd}`,
        priceKRW: `₩${kaiaData.priceKrw}`,
        totalValueUSD: `${kaiaData.totalValueUsd.toFixed(2)}`,
        totalValueKRW: `₩${kaiaData.totalValueKrw.toLocaleString('ko-KR')}`
      });
      
      await addToNotion(kaiaData);
    } else {
      console.log('⚠️ 카이아 지갑주소가 설정되지 않았습니다.');
    }
    
    console.log('✨ 카이아 지갑 잔액 추적 완료!');
  } catch (error) {
    console.error('💥 오류 발생:', error);
    process.exit(1);
  }
}
  


// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main();
}
