"""Independent educational optimistic-concurrency simulator, NOT EVM consensus."""
import csv, hashlib, json, random, time, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

def sha(b): return hashlib.sha256(b).hexdigest()
def mine(transactions, prev, index, prefix='46'):
    nonce=0
    while True:
        payload=json.dumps({'index':index,'previous':prev,'transactions':transactions,'nonce':nonce},sort_keys=True).encode()
        digest=sha(payload)
        if digest.startswith(prefix):return {'index':index,'previous':prev,'transactions':transactions,'nonce':nonce,'hash':digest}
        nonce+=1

def pow_demo(n=400):
    tx=[{'id':i,'operation':['authorize','issue','verify','revoke'][i%4]} for i in range(n)]
    blocks=[];prev='0'*64
    for i in range(0,len(tx),150):
        block=mine(tx[i:i+150],prev,len(blocks)+1);blocks.append(block);prev=block['hash']
    valid=all(sha(json.dumps({k:b[k] for k in ('index','previous','transactions','nonce')},sort_keys=True).encode())==b['hash'] and b['hash'].startswith('46') and b['previous']==(blocks[j-1]['hash'] if j else '0'*64) for j,b in enumerate(blocks))
    return blocks,valid

class State:
    def __init__(self):self.values={};self.versions={};self.lock=threading.Lock();self.aborts=0
    def apply(self,key):
        while True:
            with self.lock:old=self.versions.get(key,0);value=self.values.get(key,0)
            # execute optimistic work without holding lock
            new=value+1
            with self.lock:
                if self.versions.get(key,0)!=old:self.aborts+=1;continue
                self.values[key]=new;self.versions[key]=old+1;return

def run(keys,workers):
    state=State();start=time.perf_counter()
    if workers==1:
        for k in keys:state.apply(k)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:list(pool.map(state.apply,keys))
    return state,time.perf_counter()-start

def main():
    out=Path(__file__).parent/'results';out.mkdir(exist_ok=True)
    blocks,valid=pow_demo();(out/'blocks.json').write_text(json.dumps(blocks,indent=2));print('PoW blocks:',len(blocks),'valid:',valid)
    rows=[]
    for n in (100,400,1000):
        for conflict in (0.0,0.5,0.9):
            rng=random.Random(42);unique=max(1,round(n*(1-conflict)));keys=[rng.randrange(unique) for _ in range(n)]
            seq,t1=run(keys,1)
            for workers in (2,4,8):
                par,t2=run(keys,workers)
                same=seq.values==par.values
                rows.append({'transactions':n,'conflict_fraction':conflict,'workers':workers,'sequential_s':round(t1,6),'concurrent_s':round(t2,6),'throughput_tx_s':round(n/t2,2),'speedup':round(t1/t2,3),'aborts':par.aborts,'consistent':same})
                assert same
    with (out/'benchmark.csv').open('w',newline='') as f:w=csv.DictWriter(f,rows[0]);w.writeheader();w.writerows(rows)
    print('Saved benchmark.csv; consistent in all',len(rows),'configurations')
if __name__=='__main__':main()
