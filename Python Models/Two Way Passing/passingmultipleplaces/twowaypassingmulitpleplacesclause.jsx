import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Trash2, Settings, BarChart3 } from 'lucide-react';

// Event types
const ARRIVAL_A = 1;
const ARRIVAL_B = 2;
const RELEASE = 3;
const CLEAR = 4;
const GREEN_CHECK = 5;

class Event {
  constructor(t, kind, payload = {}) {
    this.t = t;
    this.kind = kind;
    this.payload = payload;
  }
}

class RoadDES {
  constructor(config) {
    this.segments = config.segments;
    this.speed = config.speed_mps;
    this.sim_duration = config.sim_duration_s;
    this.min_gap = config.min_gap;
    this.vehicle_length = config.vehicle_length_m;
    this.queue_space = config.queue_space_m;
    this.switch_over = config.switch_over_s;
    this.lambda_a = config.lambda_a_per_s;
    this.lambda_b = config.lambda_b_per_s;
    this.warmup = config.warmup_s || 0;
    
    this.seed = config.seed || Math.floor(Math.random() * 10000);
    this.random = this.createSeededRandom(this.seed);
    
    this.events = [];
    this.t = 0;
    this.next_vehicle_id = 1;
    
    this.queue_at_entry = {};
    this.oneway_state = {};
    this.twoway_on_seg = {};
    
    this.arrivals_count = { A: 0, B: 0 };
    this.arrival_times = { A: [], B: [] };
    this.waits = { A: [], B: [] };
    this.served = { A: 0, B: 0 };
    this.movements = [];
    this.ql_samples = {};
    
    this.init_data_structures();
  }
  
  createSeededRandom(seed) {
    let m = 0x80000000;
    let a = 1103515245;
    let c = 12345;
    let state = seed ? seed : Math.floor(Math.random() * (m - 1));
    
    return function() {
      state = (a * state + c) % m;
      return state / (m - 1);
    };
  }
  
  exp_draw(rate_per_s) {
    if (rate_per_s <= 0) return Infinity;
    return -Math.log(this.random()) / rate_per_s;
  }
  
  init_data_structures() {
    for (const seg of this.segments) {
      this.queue_at_entry[seg.id] = { A: [], B: [] };
      
      if (seg.type === 'one-way') {
        this.oneway_state[seg.id] = {
          current_dir: null,
          num_on_seg: 0,
          last_busy_change: 0
        };
        this.ql_samples[seg.id] = {
          A: [[0, 0]],
          B: [[0, 0]]
        };
      } else {
        this.twoway_on_seg[seg.id] = 0;
      }
    }
  }
  
  schedule(t, kind, payload = {}) {
    this.events.push(new Event(t, kind, payload));
    this.events.sort((a, b) => a.t - b.t);
  }
  
  travel_time(seg_len_m) {
    return seg_len_m / Math.max(1e-9, this.speed);
  }
  
  init() {
    this.schedule(this.t + this.exp_draw(this.lambda_a), ARRIVAL_A);
    this.schedule(this.t + this.exp_draw(this.lambda_b), ARRIVAL_B);
  }
  
  sample_queue(seg_id) {
    if (!this.ql_samples[seg_id]) return;
    const t = this.t;
    const qA = this.queue_at_entry[seg_id].A.length;
    const qB = this.queue_at_entry[seg_id].B.length;
    
    const lastA = this.ql_samples[seg_id].A[this.ql_samples[seg_id].A.length - 1];
    if (!lastA || lastA[1] !== qA) {
      this.ql_samples[seg_id].A.push([t, qA]);
    }
    
    const lastB = this.ql_samples[seg_id].B[this.ql_samples[seg_id].B.length - 1];
    if (!lastB || lastB[1] !== qB) {
      this.ql_samples[seg_id].B.push([t, qB]);
    }
  }
  
  try_start_green(seg) {
    const sid = seg.id;
    const state = this.oneway_state[sid];
    
    if (state.current_dir !== null || state.num_on_seg > 0) return;
    
    const QA = this.queue_at_entry[sid].A;
    const QB = this.queue_at_entry[sid].B;
    
    if (QA.length === 0 && QB.length === 0) return;
    
    const headA = QA.length > 0 ? QA[0].enqueue_time : Infinity;
    const headB = QB.length > 0 ? QB[0].enqueue_time : Infinity;
    const direction = headA <= headB ? 'A' : 'B';
    
    state.current_dir = direction;
    this.schedule(this.t, RELEASE, { seg_id: sid, dir: direction });
    this.sample_queue(sid);
  }
  
  handle_arrival(side) {
    const vid = this.next_vehicle_id++;
    const direction = side;
    const veh = {
      id: vid,
      dir: direction,
      seg_index: side === 'A' ? 0 : this.segments.length - 1,
      enqueue_time: this.t
    };
    
    const first_seg_id = side === 'A' ? this.segments[0].id : this.segments[this.segments.length - 1].id;
    this.queue_at_entry[first_seg_id][side].push(veh);
    
    this.arrivals_count[side]++;
    this.arrival_times[side].push(this.t);
    
    if (this.segments[0].type === 'one-way' && side === 'A') {
      this.sample_queue(this.segments[0].id);
    }
    if (this.segments[this.segments.length - 1].type === 'one-way' && side === 'B') {
      this.sample_queue(this.segments[this.segments.length - 1].id);
    }
    
    // Schedule next arrival
    if (side === 'A') {
      this.schedule(this.t + this.exp_draw(this.lambda_a), ARRIVAL_A);
    } else {
      this.schedule(this.t + this.exp_draw(this.lambda_b), ARRIVAL_B);
    }
    
    // Try to start any one-way green
    for (const seg of this.segments) {
      if (seg.type === 'one-way') {
        this.try_start_green(seg);
      }
    }
  }
  
  handle_release(seg_id, dir) {
    const seg = this.segments.find(s => s.id === seg_id);
    const state = this.oneway_state[seg_id];
    
    if (state.current_dir !== dir) return;
    
    const Q = this.queue_at_entry[seg_id][dir];
    if (Q.length === 0) return;
    
    const veh = Q.shift();
    const wait_time = Math.max(0, this.t - veh.enqueue_time);
    
    if (this.t >= this.warmup) {
      this.waits[dir].push(wait_time);
    }
    this.served[dir]++;
    
    state.num_on_seg++;
    if (state.num_on_seg === 1) {
      state.last_busy_change = this.t;
    }
    
    const clear_t = this.t + this.travel_time(seg.length);
    const seg_index = this.segments.findIndex(s => s.id === seg_id);
    
    const mov = {
      veh_id: veh.id,
      seg_index: seg_index,
      seg_id: seg_id,
      dir: dir,
      enter_t: this.t,
      clear_t: clear_t,
      seg_length: seg.length
    };
    this.movements.push(mov);
    
    this.schedule(clear_t, CLEAR, { seg_id, dir, veh });
    this.sample_queue(seg_id);
    
    // Next release after min_gap if queue remains
    if (Q.length > 0) {
      const next_release_t = this.t + this.min_gap;
      if (next_release_t <= this.sim_duration) {
        this.schedule(next_release_t, RELEASE, { seg_id, dir });
      }
    }
  }
  
  handle_clear(seg_id, dir, veh) {
    const seg_index = this.segments.findIndex(s => s.id === seg_id);
    const seg = this.segments[seg_index];
    
    if (seg.type === 'one-way') {
      const state = this.oneway_state[seg_id];
      state.num_on_seg--;
      if (state.num_on_seg === 0) {
        this.schedule(this.t + this.switch_over, GREEN_CHECK, { seg_id });
      }
    } else {
      this.twoway_on_seg[seg_id] = Math.max(0, this.twoway_on_seg[seg_id] - 1);
    }
    
    // Move to next segment or leave
    let next_index, approach_side;
    if (veh.dir === 'A') {
      next_index = seg_index + 1;
      approach_side = 'A';
    } else {
      next_index = seg_index - 1;
      approach_side = 'B';
    }
    
    if (next_index < 0 || next_index >= this.segments.length) return;
    
    const next_seg = this.segments[next_index];
    const next_seg_id = next_seg.id;
    veh.enqueue_time = this.t;
    veh.seg_index = next_index;
    
    this.queue_at_entry[next_seg_id][approach_side].push(veh);
    
    if (next_seg.type === 'one-way') {
      this.sample_queue(next_seg_id);
      this.try_start_green(next_seg);
    } else {
      const q = this.queue_at_entry[next_seg_id][approach_side];
      if (q.length > 0 && q[0] === veh) {
        q.shift();
        this.twoway_on_seg[next_seg_id]++;
        const clear_t = this.t + this.travel_time(next_seg.length);
        
        const mov = {
          veh_id: veh.id,
          seg_index: next_index,
          seg_id: next_seg_id,
          dir: approach_side,
          enter_t: this.t,
          clear_t: clear_t,
          seg_length: next_seg.length
        };
        this.movements.push(mov);
        
        this.schedule(clear_t, CLEAR, { seg_id: next_seg_id, dir: approach_side, veh });
      }
    }
  }
  
  handle_green_check(seg_id) {
    const seg = this.segments.find(s => s.id === seg_id);
    const state = this.oneway_state[seg_id];
    
    if (state.num_on_seg > 0) return;
    
    const QA = this.queue_at_entry[seg_id].A;
    const QB = this.queue_at_entry[seg_id].B;
    
    if (QA.length === 0 && QB.length === 0) {
      state.current_dir = null;
      return;
    }
    
    const headA = QA.length > 0 ? QA[0].enqueue_time : Infinity;
    const headB = QB.length > 0 ? QB[0].enqueue_time : Infinity;
    const direction = headA <= headB ? 'A' : 'B';
    
    state.current_dir = direction;
    this.schedule(this.t, RELEASE, { seg_id, dir: direction });
    this.sample_queue(seg_id);
  }
  
  run() {
    this.init();
    
    while (this.events.length > 0) {
      const ev = this.events.shift();
      if (ev.t > this.sim_duration) break;
      
      this.t = ev.t;
      
      switch (ev.kind) {
        case ARRIVAL_A:
          this.handle_arrival('A');
          break;
        case ARRIVAL_B:
          this.handle_arrival('B');
          break;
        case RELEASE:
          this.handle_release(ev.payload.seg_id, ev.payload.dir);
          break;
        case CLEAR:
          this.handle_clear(ev.payload.seg_id, ev.payload.dir, ev.payload.veh);
          break;
        case GREEN_CHECK:
          this.handle_green_check(ev.payload.seg_id);
          break;
      }
    }
    
    return {
      movements: this.movements,
      ql_samples: this.ql_samples,
      served: this.served,
      waits: this.waits,
      arrival_times: this.arrival_times
    };
  }
}

const RoadSimulationGUI = () => {
  const [segments, setSegments] = useState([
    { id: 1, type: 'one-way', length: 30 }
  ]);
  const [params, setParams] = useState({
    speed_kmh: 20,
    sim_hours: 10,
    min_gap: 0,
    vehicle_length: 4.5,
    queue_space: 6.5,
    switch_over: 0,
    lambda_a_vph: 15,
    lambda_b_vph: 15
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showStats, setShowStats] = useState(false);
  
  const intervalRef = useRef(null);
  
  const addSegment = () => {
    const newId = Math.max(...segments.map(s => s.id)) + 1;
    setSegments([...segments, { id: newId, type: 'one-way', length: 30 }]);
  };
  
  const removeSegment = (id) => {
    setSegments(segments.filter(s => s.id !== id));
  };
  
  const updateSegment = (id, field, value) => {
    setSegments(segments.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };
  
  const updateParam = (key, value) => {
    setParams({ ...params, [key]: parseFloat(value) || 0 });
  };
  
  const runSimulation = () => {
    setIsRunning(true);
    
    const config = {
      segments,
      speed_mps: params.speed_kmh / 3.6,
      sim_duration_s: params.sim_hours * 3600,
      min_gap: params.min_gap,
      vehicle_length_m: params.vehicle_length,
      queue_space_m: params.queue_space,
      switch_over_s: params.switch_over,
      lambda_a_per_s: params.lambda_a_vph / 3600,
      lambda_b_per_s: params.lambda_b_vph / 3600,
      warmup_s: 0,
      seed: Math.floor(Math.random() * 10000)
    };
    
    try {
      const sim = new RoadDES(config);
      const result = sim.run();
      setResults(result);
      setCurrentTime(0);
    } catch (error) {
      console.error('Simulation error:', error);
      alert('Simulation failed: ' + error.message);
    }
    
    setIsRunning(false);
  };
  
  const startPlayback = () => {
    if (!results) return;
    
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setCurrentTime(prev => {
        const maxTime = Math.max(...results.movements.map(m => m.clear_t), params.sim_hours * 3600);
        const next = prev + playbackSpeed;
        if (next >= maxTime) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 100);
  };
  
  const stopPlayback = () => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  const resetPlayback = () => {
    stopPlayback();
    setCurrentTime(0);
  };
  
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getQueueAtTime = (samples, time) => {
    if (!samples || samples.length === 0) return 0;
    
    let result = 0;
    for (const [t, q] of samples) {
      if (t <= time) result = q;
      else break;
    }
    return result;
  };
  
  const renderRoad = () => {
    const scale = 3; // 3m per unit for better resolution
    
    return (
      <div className="bg-gradient-to-b from-gray-700 to-gray-800 p-6 rounded-lg shadow-lg">
        {/* Direction indicators */}
        <div className="mb-4 flex justify-between items-center text-white">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-blue-300 font-semibold">Direction A → B</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-red-300 font-semibold">Direction B ← A</span>
            <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
          </div>
        </div>
        
        <div className="relative">
          {/* Queue A with realistic spacing */}
          <div className="absolute left-0 top-8 flex items-center space-x-1">
            {results && segments.length > 0 && (
              Array(Math.min(getQueueAtTime(results.ql_samples[segments[0].id]?.A, currentTime), 8))
                .fill(0).map((_, i) => (
                  <div key={i} className="w-8 h-4 bg-blue-500 rounded-sm shadow-md flex items-center justify-center text-xs text-white font-bold">
                    🚗
                  </div>
                ))
            )}
          </div>
          
          {/* Queue B with realistic spacing */}
          <div className="absolute right-0 top-8 flex items-center space-x-1 flex-row-reverse">
            {results && segments.length > 0 && (
              Array(Math.min(getQueueAtTime(results.ql_samples[segments[segments.length-1].id]?.B, currentTime), 8))
                .fill(0).map((_, i) => (
                  <div key={i} className="w-8 h-4 bg-red-500 rounded-sm shadow-md flex items-center justify-center text-xs text-white font-bold">
                    🚙
                  </div>
                ))
            )}
          </div>
          
          {/* Road segments with realistic appearance */}
          <div className="flex items-center justify-center mt-16 mb-8">
            {segments.map((seg, idx) => {
              const pixelWidth = Math.max(60, Math.ceil(seg.length / scale) * 8);
              const segmentVehicles = [];
              
              // Place vehicles with realistic positioning
              if (results) {
                results.movements.forEach(m => {
                  if (m.seg_index === idx && m.enter_t <= currentTime && currentTime < m.clear_t) {
                    const progress = (currentTime - m.enter_t) / (m.clear_t - m.enter_t);
                    let positionPercent = progress * 100;
                    if (m.dir === 'B') {
                      positionPercent = 100 - positionPercent;
                    }
                    segmentVehicles.push({
                      id: m.veh_id,
                      dir: m.dir,
                      position: positionPercent
                    });
                  }
                });
              }
              
              return (
                <div key={seg.id} className="relative mx-1">
                  {/* Road surface */}
                  <div 
                    className={`relative ${
                      seg.type === 'one-way' 
                        ? 'bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600' 
                        : 'bg-gradient-to-r from-gray-500 via-gray-400 to-gray-500'
                    } rounded-lg shadow-inner`}
                    style={{ width: `${pixelWidth}px`, height: '40px' }}
                  >
                    {/* Road markings */}
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white opacity-70 transform -translate-y-0.5">
                      {seg.type === 'two-way' && (
                        <div className="absolute top-0 left-0 right-0 border-t-2 border-dashed border-white opacity-50"></div>
                      )}
                    </div>
                    
                    {/* One-way barriers */}
                    {seg.type === 'one-way' && (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-orange-600 rounded-l-lg"></div>
                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-orange-600 rounded-r-lg"></div>
                      </>
                    )}
                    
                    {/* Vehicles on segment */}
                    {segmentVehicles.map((veh) => (
                      <div
                        key={veh.id}
                        className={`absolute top-1/2 transform -translate-y-1/2 w-6 h-3 rounded-sm shadow-lg ${
                          veh.dir === 'A' ? 'bg-blue-500' : 'bg-red-500'
                        } flex items-center justify-center text-xs text-white font-bold transition-all duration-100`}
                        style={{ 
                          left: `${Math.max(2, Math.min(veh.position, 92))}%`,
                          zIndex: 10
                        }}
                      >
                        {veh.dir === 'A' ? '🚗' : '🚙'}
                      </div>
                    ))}
                    
                    {/* Segment label */}
                    <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-300 font-semibold">
                      S{seg.id} ({seg.length}m)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Time and status display */}
        <div className="mt-4 flex justify-between items-center text-sm text-gray-300">
          <div>
            Time: {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
          </div>
          <div>
            Scale: 1 unit = {scale}m
          </div>
          <div>
            Active Vehicles: {results ? results.movements.filter(m => 
              m.enter_t <= currentTime && currentTime < m.clear_t
            ).length : 0}
          </div>
        </div>
      </div>
    );
  };
  
  const renderStats = () => {
    if (!results) return null;
    
    const avgWaitA = results.waits.A.length > 0 ? 
      results.waits.A.reduce((a, b) => a + b, 0) / results.waits.A.length : 0;
    const avgWaitB = results.waits.B.length > 0 ? 
      results.waits.B.reduce((a, b) => a + b, 0) / results.waits.B.length : 0;
    
    // Calculate waiting statistics - percentage of vehicles that had to wait different numbers of times
    const calculateWaitingStats = (direction) => {
      const waits = results.waits[direction];
      if (waits.length === 0) return {};
      
      let noWaitCount = 0;
      let waitedCount = 0;
      
      waits.forEach(waitTime => {
        if (waitTime <= 0.1) { // Less than 0.1s considered no wait
          noWaitCount++;
        } else {
          waitedCount++;
        }
      });
      
      const total = waits.length;
      return {
        noWait: ((noWaitCount / total) * 100).toFixed(1),
        hadToWait: ((waitedCount / total) * 100).toFixed(1),
        totalVehicles: total
      };
    };
    
    const waitStatsA = calculateWaitingStats('A');
    const waitStatsB = calculateWaitingStats('B');
    
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Simulation Results</h3>
        
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
            <h4 className="font-semibold text-blue-800 mb-3">Direction A → B</h4>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Vehicles served:</span> {results.served.A}</p>
              <p><span className="font-medium">Average wait time:</span> {avgWaitA.toFixed(2)}s</p>
              <p><span className="font-medium">No wait required:</span> {waitStatsA.noWait}% ({Math.round(waitStatsA.totalVehicles * waitStatsA.noWait / 100)} vehicles)</p>
              <p><span className="font-medium">Had to wait:</span> {waitStatsA.hadToWait}% ({Math.round(waitStatsA.totalVehicles * waitStatsA.hadToWait / 100)} vehicles)</p>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
            <h4 className="font-semibold text-red-800 mb-3">Direction B ← A</h4>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Vehicles served:</span> {results.served.B}</p>
              <p><span className="font-medium">Average wait time:</span> {avgWaitB.toFixed(2)}s</p>
              <p><span className="font-medium">No wait required:</span> {waitStatsB.noWait}% ({Math.round(waitStatsB.totalVehicles * waitStatsB.noWait / 100)} vehicles)</p>
              <p><span className="font-medium">Had to wait:</span> {waitStatsB.hadToWait}% ({Math.round(waitStatsB.totalVehicles * waitStatsB.hadToWait / 100)} vehicles)</p>
            </div>
          </div>
        </div>
        
        {/* One-way Segment Queue Analysis */}
        <div className="mb-6">
          <h4 className="font-semibold mb-3 text-gray-800">One-Way Segment Queue Analysis</h4>
          {segments.filter(s => s.type === 'one-way').map(seg => {
            const segId = seg.id;
            const samplesA = results.ql_samples[segId]?.A || [];
            const samplesB = results.ql_samples[segId]?.B || [];
            
            // Calculate max queue lengths
            const maxQueueA = Math.max(...samplesA.map(s => s[1]), 0);
            const maxQueueB = Math.max(...samplesB.map(s => s[1]), 0);
            
            // Calculate current queue lengths
            const currentQueueA = getQueueAtTime(samplesA, currentTime);
            const currentQueueB = getQueueAtTime(samplesB, currentTime);
            
            // Calculate time-weighted averages
            const calcAvgQueue = (samples) => {
              if (samples.length < 2) return 0;
              let totalTime = 0;
              let weightedSum = 0;
              for (let i = 0; i < samples.length - 1; i++) {
                const [t1, q1] = samples[i];
                const [t2] = samples[i + 1];
                const duration = t2 - t1;
                totalTime += duration;
                weightedSum += q1 * duration;
              }
              return totalTime > 0 ? weightedSum / totalTime : 0;
            };
            
            const avgQueueA = calcAvgQueue(samplesA);
            const avgQueueB = calcAvgQueue(samplesB);
            
            return (
              <div key={segId} className="border rounded-lg p-4 mb-4 bg-gray-50">
                <h5 className="font-medium mb-3 text-gray-700">
                  Segment {segId} ({seg.length}m one-way)
                </h5>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-100 p-3 rounded border-l-4 border-blue-400">
                    <h6 className="font-medium text-blue-800 mb-2">A-side Queue (Entry from A)</h6>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Current:</span> {currentQueueA} vehicles</p>
                      <p><span className="font-medium">Maximum:</span> {maxQueueA} vehicles</p>
                      <p><span className="font-medium">Time-weighted avg:</span> {avgQueueA.toFixed(2)} vehicles</p>
                    </div>
                  </div>
                  
                  <div className="bg-red-100 p-3 rounded border-l-4 border-red-400">
                    <h6 className="font-medium text-red-800 mb-2">B-side Queue (Entry from B)</h6>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Current:</span> {currentQueueB} vehicles</p>
                      <p><span className="font-medium">Maximum:</span> {maxQueueB} vehicles</p>
                      <p><span className="font-medium">Time-weighted avg:</span> {avgQueueB.toFixed(2)} vehicles</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {segments.filter(s => s.type === 'one-way').length === 0 && (
            <p className="text-gray-500 italic">No one-way segments configured.</p>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-purple-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Road Traffic Simulation</h1>
        <p className="text-gray-600">Configure road segments and simulate traffic flow</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Settings className="mr-2" size={20} />
              Configuration
            </h2>
            
            {/* Traffic Parameters */}
            <div className="mb-6">
              <h3 className="font-medium mb-3">Traffic Parameters</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Speed (km/h)</label>
                  <input
                    type="number"
                    value={params.speed_kmh}
                    onChange={(e) => updateParam('speed_kmh', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Simulation Duration (hours)</label>
                  <input
                    type="number"
                    value={params.sim_hours}
                    onChange={(e) => updateParam('sim_hours', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">A→B Rate (veh/hour)</label>
                  <input
                    type="number"
                    value={params.lambda_a_vph}
                    onChange={(e) => updateParam('lambda_a_vph', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">B→A Rate (veh/hour)</label>
                  <input
                    type="number"
                    value={params.lambda_b_vph}
                    onChange={(e) => updateParam('lambda_b_vph', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Min Gap (seconds)</label>
                  <input
                    type="number"
                    value={params.min_gap}
                    onChange={(e) => updateParam('min_gap', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Switch Over Time (seconds)</label>
                  <input
                    type="number"
                    value={params.switch_over}
                    onChange={(e) => updateParam('switch_over', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>
            </div>
            
            {/* Road Segments */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">Road Segments</h3>
                <button
                  onClick={addSegment}
                  className="flex items-center px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  <Plus size={16} className="mr-1" />
                  Add
                </button>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {segments.map((seg) => (
                  <div key={seg.id} className="border rounded-md p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Segment {seg.id}</span>
                      <button
                        onClick={() => removeSegment(seg.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <select
                        value={seg.type}
                        onChange={(e) => updateSegment(seg.id, 'type', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="one-way">One-way</option>
                        <option value="two-way">Two-way</option>
                      </select>
                      <input
                        type="number"
                        value={seg.length}
                        onChange={(e) => updateSegment(seg.id, 'length', parseFloat(e.target.value) || 0)}
                        placeholder="Length (m)"
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Run Simulation */}
            <button
              onClick={runSimulation}
              disabled={isRunning || segments.length === 0}
              className="w-full py-3 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running...' : 'Run Simulation'}
            </button>
          </div>
        </div>
        
        {/* Visualization Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Visualization</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                  <BarChart3 size={16} />
                </button>
              </div>
            </div>
            
            {/* Road Visualization */}
            {renderRoad()}
            
            {/* Playback Controls */}
            {results && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={isPlaying ? stopPlayback : startPlayback}
                      className="flex items-center px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      onClick={resetPlayback}
                      className="flex items-center px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm">Speed:</label>
                    <select
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                      className="px-2 py-1 border rounded"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={5}>5x</option>
                      <option value={10}>10x</option>
                    </select>
                  </div>
                </div>
                
                {/* Time Slider */}
                <div className="mb-2">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(...results.movements.map(m => m.clear_t), params.sim_hours * 3600)}
                    value={currentTime}
                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <div className="text-sm text-gray-600">
                  Time: {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} 
                  / {Math.floor((params.sim_hours * 3600) / 60)}:{String(Math.floor((params.sim_hours * 3600) % 60)).padStart(2, '0')}
                </div>
              </div>
            )}
            
            {/* Statistics Panel */}
            {showStats && results && (
              <div className="mt-6">
                {renderStats()}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Help Section */}
      <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">How to Use</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <h3 className="font-medium mb-2">1. Configure Road</h3>
            <p>Add road segments and set their type (one-way or two-way) and length. One-way segments create bottlenecks where vehicles must wait for their turn.</p>
          </div>
          <div>
            <h3 className="font-medium mb-2">2. Set Parameters</h3>
            <p>Adjust traffic parameters like vehicle speed, arrival rates for each direction, and timing constraints like minimum gaps and switch-over times.</p>
          </div>
          <div>
            <h3 className="font-medium mb-2">3. Run & Analyze</h3>
            <p>Run the simulation to see results. Use playback controls to visualize traffic flow over time. View statistics to analyze queue lengths and wait times.</p>
          </div>
        </div>
        
        <div className="mt-4 p-4 bg-blue-50 rounded">
          <h4 className="font-medium mb-2">Legend</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-yellow-200 border border-gray-400 mr-2"></div>
              <span>One-way segment</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-200 border border-gray-400 mr-2"></div>
              <span>Two-way segment</span>
            </div>
            <div className="flex items-center">
              <span className="font-mono bg-gray-700 text-white px-2 py-1 rounded mr-2">🚗</span>
              <span>Vehicle moving A→B</span>
            </div>
            <div className="flex items-center">
              <span className="font-mono bg-gray-700 text-white px-2 py-1 rounded mr-2">🚙</span>
              <span>Vehicle moving B→A</span>
            </div>
            <div className="flex items-center">
              <div className="w-8 h-4 bg-blue-500 rounded mr-2 flex items-center justify-center text-xs">🚗</div>
              <span>Queued vehicle (A side)</span>
            </div>
            <div className="flex items-center">
              <div className="w-8 h-4 bg-red-500 rounded mr-2 flex items-center justify-center text-xs">🚙</div>
              <span>Queued vehicle (B side)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoadSimulationGUI;