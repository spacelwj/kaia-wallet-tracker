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
const KAIASCOPE_API = 'https://api.kaiascope.com/v2';

// 토큰 정보 캐시 (발견된 토큰들을 저장)
let discoveredTokens = new Map();

// 호환성을 위한 기존 TOKEN_INFO (필요시 사용)
const TOKEN_INFO = {
  KAIA: {
    coingecko_id: 'kaia',
    decimals: 18,
    symbol: 'KAIA'
  }
};

// 인기 카이아 체인 토큰들 (확장된 리스트)
const POPULAR_KAIA_TOKENS = [
  {
    symbol: 'KAIA',
    name: 'Kaia',
    address: 'native',
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
  },
  // 추가 인기 토큰들
  {
    symbol: 'HANDY',
    name: 'Handy',
    address: '0x20d61eb55f8c93d78c1bdd5ba0e6dcc6c74b1d50',
    coingecko_id: 'handy',
    decimals: 18
  },
  {
    symbol: 'BELT',
    name: 'Belt Finance',
    address: '0x1b6d6c6cbeec1b1e0b6c6bb9b02b1b1e9b0e6e8e',
    coingecko_id: 'belt',
    decimals: 18
  },
  {
    symbol: 'BORA',
    name: 'BORA',
    address: '0x02cbe46fb8a1f579254a9b485788f2d86cad51aa',
    coingecko_id: 'bora',
    decimals: 18
  },
  // DeFi 토큰들
  {
    symbol: 'ISR',
    name: 'Iskra Token',
    address: '0x34d21b1e550d73cee41151c77f3c73359527a396',
    coingecko_id: 'iskra-token',
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

// 지갑의 거래 내역에서 토큰 발견하기 (개선된 버전)
async function discoverTokensFromTransactions(walletAddress) {
  try {
    console.log(`🔍 ${walletAddress}의 거래 내역에서 토큰 검색 중...`);
    
    // 여러 API 엔드포인트 시도
    const endpoints = [
      // Kaiascope 새로운 API
      `https://api.kaiascope.com/v1/accounts/${walletAddress}/token-transfers?size=50`,
      // Klaytnscope (기존)
      `https://api.klaytnscope.com/v2/accounts/${walletAddress}/token-transfers?size=50`,
      // 대체 엔드포인트
      `https://th-api.klaytnapi.com/v2/transfer/account/${walletAddress}?kind=klay&kind=ft&size=50`
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`🌐 API 호출: ${endpoint}`);
        
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'KaiaWalletTracker/1.0'
          }
        });
        
        console.log(`📡 응답 상태: ${response.status}`);
        
        if (response.status === 404) {
          console.log(`⚠️ 엔드포인트를 찾을 수 없음: ${endpoint}`);
          continue;
        }
        
        if (!response.ok) {
          console.log(`❌ API 응답 오류: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const data = await response.json();
        console.log(`✅ API 응답 성공! 데이터 구조:`, Object.keys(data));
        
        // 다양한 응답 구조 처리
        let transfers = [];
        if (data.results) transfers = data.results;
        else if (data.data) transfers = data.data;
        else if (data.items) transfers = data.items;
        else if (Array.isArray(data)) transfers = data;
        
        console.log(`📊 전송 기록 ${transfers.length}개 발견`);
        
        if (transfers.length > 0) {
          const uniqueTokens = new Set();
          
          transfers.forEach((transfer, index) => {
            if (index < 3) console.log(`🔍 전송 기록 샘플 ${index + 1}:`, transfer);
            
            // 다양한 필드명 처리
            const contractAddress = transfer.contract_address || 
                                   transfer.contractAddress || 
                                   transfer.token_address ||
                                   transfer.tokenAddress;
            
            const symbol = transfer.symbol || 
                          transfer.token_symbol ||
                          transfer.tokenSymbol;
            
            const name = transfer.name || 
                        transfer.token_name ||
                        transfer.tokenName ||
                        symbol;
            
            const decimals = transfer.decimals || 
                           transfer.token_decimals ||
                           transfer.tokenDecimals ||
                           18;
            
            if (contractAddress && symbol) {
              const tokenKey = contractAddress.toLowerCase();
              if (!uniqueTokens.has(tokenKey)) {
                uniqueTokens.add(tokenKey);
                discoveredTokens.set(tokenKey, {
                  symbol: symbol,
                  name: name,
                  address: contractAddress,
                  decimals: parseInt(decimals),
                  coingecko_id: null
                });
                console.log(`🎯 토큰 발견: ${symbol} (${contractAddress})`);
              }
            }
          });
          
          console.log(`✅ 총 ${uniqueTokens.size}개의 고유 토큰 발견`);
          return Array.from(discoveredTokens.values());
        }
        
      } catch (error) {
        console.log(`❌ API 호출 실패 (${endpoint}):`, error.message);
      }
    }
    
    // API가 모두 실패한 경우 더 많은 미리 정의된 토큰 반환
    console.log('⚠️ 모든 API 실패, 확장된 토큰 리스트 사용');
    return [
      {
        symbol: 'oUSDT',
        name: 'Orbit Bridge Klaytn USD Tether',
        address: '0xcee8faf64bb97a73bb51e115aa89c17ffa8dd167',
        decimals: 6,
        coingecko_id: 'tether'
      },
      {
        symbol: 'oUSDC', 
        name: 'Orbit Bridge Klaytn USD Coin',
        address: '0x754288077d0ff82af7a5317c7cb8c444d421d103',
        decimals: 6,
        coingecko_id: 'usd-coin'
      },
      {
        symbol: 'WKLAY',
        name: 'Wrapped KLAY',
        address: '0x5819b6af194a78511c79c85ea68d2377a7e9335f',
        decimals: 18,
        coingecko_id: 'wrapped-klay'
      },
      {
        symbol: 'KSP',
        name: 'KLAYswap Protocol',
        address: '0xc6a2ad8cc6d4a3e08b56e33d68b7f1c3618f40d3',
        decimals: 18,
        coingecko_id: 'klayswap-protocol'
      }
    ];
    
  } catch (error) {
    console.error('❌ 토큰 발견 과정 전체 오류:', error);
    return [];
  }
}

// CoinGecko에서 토큰 ID 찾기
async function findCoinGeckoId(tokenSymbol, tokenAddress) {
  try {
    // 1. 심볼로 먼저 검색
    const symbolResponse = await fetch(`${COINGECKO_API}/search?query=${tokenSymbol}`);
    const symbolData = await symbolResponse.json();
    
    if (symbolData.coins && symbolData.coins.length > 0) {
      // 카이아 체인에 있는 토큰 찾기
      const kaiaToken = symbolData.coins.find(coin => 
        coin.symbol.toLowerCase() === tokenSymbol.toLowerCase()
      );
      
      if (kaiaToken) {
        return kaiaToken.id;
      }
    }
    
    // 2. 미리 정의된 토큰에서 찾기
    const predefinedToken = POPULAR_KAIA_TOKENS.find(token => 
      token.symbol.toLowerCase() === tokenSymbol.toLowerCase() ||
      token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    
    if (predefinedToken) {
      return predefinedToken.coingecko_id;
    }
    
    // 3. 기본값 반환
    return tokenSymbol.toLowerCase();
    
  } catch (error) {
    console.log(`CoinGecko ID 찾기 실패 (${tokenSymbol}):`, error.message);
    return tokenSymbol.toLowerCase();
  }
}
// 지갑의 모든 토큰 잔액 조회 (자동 발견 + 미리 정의된 토큰)
async function getAllTokenBalances(walletAddress) {
  const balances = [];
  
  console.log(`🔍 지갑의 모든 토큰 조회 중: ${walletAddress}`);
  
  // 1. 거래 내역에서 토큰 자동 발견
  console.log('📊 거래 내역 분석으로 토큰 자동 검색...');
  const discoveredTokensList = await discoverTokensFromTransactions(walletAddress);
  
  // 2. 미리 정의된 토큰과 발견된 토큰 합치기
  const allTokensMap = new Map();
  
  // 미리 정의된 토큰 추가
  POPULAR_KAIA_TOKENS.forEach(token => {
    const key = token.address === 'native' ? 'native' : token.address.toLowerCase();
    allTokensMap.set(key, token);
  });
  
  // 발견된 토큰 추가 (중복 제거)
  for (const discoveredToken of discoveredTokensList) {
    const key = discoveredToken.address.toLowerCase();
    if (!allTokensMap.has(key)) {
      // CoinGecko ID 찾기
      if (!discoveredToken.coingecko_id) {
        discoveredToken.coingecko_id = await findCoinGeckoId(discoveredToken.symbol, discoveredToken.address);
      }
      allTokensMap.set(key, discoveredToken);
    }
  }
  
  const allTokens = Array.from(allTokensMap.values());
  console.log(`🎯 총 ${allTokens.length}개 토큰 검사 예정 (미리정의: ${POPULAR_KAIA_TOKENS.length}개, 자동발견: ${discoveredTokensList.length}개)`);
  
  // 3. 각 토큰별로 잔액 확인
  let checkedCount = 0;
  for (const token of allTokens) {
    try {
      checkedCount++;
      console.log(`🔍 [${checkedCount}/${allTokens.length}] ${token.symbol} 잔액 확인 중...`);
      
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
        console.log(`✅ ${token.symbol}: ${balance} (보유 중!)`);
      } else {
        console.log(`⚪ ${token.symbol}: 0 (보유하지 않음)`);
      }
      
      // API 호출 간격 조절 (과부하 방지)
      await new Promise(resolve => setTimeout(resolve, 200));
      
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
