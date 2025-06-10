const fetch = require('node-fetch');

// 환경변수에서 설정값 가져오기
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const KAIA_WALLET_ADDRESS = process.env.KAIA_WALLET_ADDRESS;

// API 엔드포인트 (카이아 메인넷)
const KAIA_RPC_ENDPOINTS = [
  'https://public-en-node.kaia.io',
  'https://public-en-cypress.klaytn.net',
  'https://rpc.ankr.com/klaytn'
];
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const KLAYTNSCOPE_API = 'https://scope.klaytn.com/api/v2';

// 호환성을 위한 기존 TOKEN_INFO (필요시 사용)
const TOKEN_INFO = {
  KAIA: {
    coingecko_id: 'kaia',
    decimals: 18,
    symbol: 'KAIA'
  }
};

// 인기 카이아 체인 토큰들 (자동 검색용)
const POPULAR_KAIA_TOKENS = [
  {
    symbol: 'KAIA',
    name: 'Kaia',
    address: 'native', // 네이티브 토큰
    coingecko_id: 'kaia',
    decimals: 18
  },
  {
    symbol: 'oUSDT',
    name: 'Orbit Bridge Klaytn USD Tether',
    address: '0xcee8faf64bb97a73bb51e115aa89c17ffa8dd167',
    coingecko_id: 'tether',
    decimals: 6
  },
  {
    symbol: 'oUSDC',
    name: 'Orbit Bridge Klaytn USD Coin',
    address: '0x754288077d0ff82af7a5317c7cb8c444d421d103',
    coingecko_id: 'usd-coin',
    decimals: 6
  },
  {
    symbol: 'WKLAY',
    name: 'Wrapped KLAY',
    address: '0x5819b6af194a78511c79c85ea68d2377a7e9335f',
    coingecko_id: 'wrapped-klay',
    decimals: 18
  },
  {
    symbol: 'KSP',
    name: 'KLAYswap Protocol',
    address: '0xc6a2ad8cc6d4a3e08b56e33d68b7f1c3618f40d3',
    coingecko_id: 'klayswap-protocol',
    decimals: 18
  },
  {
    symbol: 'SSX',
    name: 'SOMESING',
    address: '0x48c811855d7c8f33baab9eaf3f04baaf5c7a1b7e',
    coingecko_id: 'somesing',
    decimals: 18
  }
];

// ERC-20 토큰 ABI (balanceOf 함수만)
const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  }
];

// 네이티브 KAIA 잔액 조회
async function getKaiaBalance(address) {
  for (const endpoint of KAIA_RPC_ENDPOINTS) {
    try {
      console.log(`💰 KAIA 잔액 조회 중... (${endpoint})`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'kaia_getBalance',
          params: [address, 'latest'],
          id: 1
        })
      });
      
      const data = await response.json();
      
      if (data.result) {
        const balanceInWei = BigInt(data.result);
        const balanceInKaia = Number(balanceInWei) / Math.pow(10, 18);
        console.log(`✅ KAIA 잔액: ${balanceInKaia}`);
        return balanceInKaia;
      } else if (data.error) {
        console.log(`⚠️ ${endpoint}에서 오류: ${data.error.message}`);
        // kaia_ 메서드가 실패하면 klay_ 메서드로 재시도
        if (data.error.message.includes('kaia_getBalance')) {
          const retryResponse = await fetch(endpoint, {
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
          
          const retryData = await retryResponse.json();
          if (retryData.result) {
            const balanceInWei = BigInt(retryData.result);
            const balanceInKaia = Number(balanceInWei) / Math.pow(10, 18);
            console.log(`✅ KAIA 잔액 (klay_ 메서드): ${balanceInKaia}`);
            return balanceInKaia;
          }
        }
      }
    } catch (error) {
      console.log(`❌ 엔드포인트 ${endpoint} 실패:`, error.message);
    }
  }
  
  console.error('❌ 모든 카이아 RPC 엔드포인트 실패');
  return 0;
}

// ERC-20 토큰 잔액 조회
async function getTokenBalance(walletAddress, tokenAddress, decimals = 18) {
  for (const endpoint of KAIA_RPC_ENDPOINTS) {
    try {
      // ERC-20 balanceOf 함수 호출 데이터 생성
      const functionSelector = '0x70a08231'; // balanceOf(address)
      const paddedAddress = walletAddress.slice(2).padStart(64, '0');
      const callData = functionSelector + paddedAddress;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'kaia_call',
          params: [{
            to: tokenAddress,
            data: callData
          }, 'latest'],
          id: 1
        })
      });
      
      const data = await response.json();
      
      if (data.result && data.result !== '0x') {
        const balanceInWei = BigInt(data.result);
        const balance = Number(balanceInWei) / Math.pow(10, decimals);
        return balance;
      } else {
        // kaia_call 실패시 klay_call로 재시도
        const retryResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'klay_call',
            params: [{
              to: tokenAddress,
              data: callData
            }, 'latest'],
            id: 1
          })
        });
        
        const retryData = await retryResponse.json();
        if (retryData.result && retryData.result !== '0x') {
          const balanceInWei = BigInt(retryData.result);
          const balance = Number(balanceInWei) / Math.pow(10, decimals);
          return balance;
        }
      }
    } catch (error) {
      console.log(`토큰 잔액 조회 실패 (${endpoint}):`, error.message);
    }
  }
  
  return 0;
}

// 지갑의 모든 토큰 잔액 조회
async function getAllTokenBalances(walletAddress) {
  const balances = [];
  
  console.log(`🔍 지갑의 모든 토큰 조회 중: ${walletAddress}`);
  
  // 각 토큰별로 잔액 확인
  for (const token of POPULAR_KAIA_TOKENS) {
    try {
      let balance = 0;
      
      if (token.address === 'native') {
        // 네이티브 KAIA 토큰
        balance = await getKaiaBalance(walletAddress);
      } else {
        // ERC-20 토큰
        balance = await getTokenBalance(walletAddress, token.address, token.decimals);
      }
      
      // 잔액이 0보다 큰 경우만 추가
      if (balance > 0) {
        balances.push({
          ...token,
          balance: balance
        });
        console.log(`✅ ${token.symbol}: ${balance}`);
      } else {
        console.log(`⚪ ${token.symbol}: 0 (스킵)`);
      }
      
      // API 호출 간격 조절 (과부하 방지)
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ ${token.symbol} 조회 실패:`, error.message);
    }
  }
  
  console.log(`🎯 총 ${balances.length}개 토큰 발견`);
  return balances;
}

// 토큰 가격 조회 (단일 토큰용 - 호환성 유지)
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

// 토큰 가격 조회 (여러 토큰 동시 조회)
async function getMultipleTokenPrices(coingeckoIds) {
  try {
    const idsString = coingeckoIds.join(',');
    const response = await fetch(`${COINGECKO_API}/simple/price?ids=${idsString}&vs_currencies=usd,krw`);
    const data = await response.json();
    
    const prices = {};
    for (const id of coingeckoIds) {
      prices[id] = {
        usd: data[id]?.usd || 0,
        krw: data[id]?.krw || 0
      };
    }
    
    return prices;
  } catch (error) {
    console.error('토큰 가격 조회 실패:', error);
    return {};
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
