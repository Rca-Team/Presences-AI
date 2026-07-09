import { supabase } from '@/integrations/supabase/client';

export interface UnifiedAttendanceStats {
  totalRegistered: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  attendanceRate: number;
}

/**
 * Single source of truth for attendance stats.
 * 1. Registered = attendance_records with status='registered' (canonical registration table)
 * 2. Present/Late from attendance_records (present/late/unauthorized) + gate_entries
 * 3. Multi-identifier matching (employee_id, user_id, registration id)
 * 4. Status normalization: unauthorized → present
 */
export async function fetchUnifiedAttendanceStats(): Promise<UnifiedAttendanceStats> {
  const today = new Date().toISOString().split('T')[0];

  const [registeredRes, todayRes, gateRes] = await Promise.all([
    supabase.from('attendance_records')
      .select('id, user_id, device_info, category')
      .eq('status', 'registered'),
    supabase.from('attendance_records')
      .select('id, user_id, status, device_info')
      .in('status', ['present', 'late', 'unauthorized'])
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`),
    supabase.from('gate_entries')
      .select('student_id')
      .gte('entry_time', `${today}T00:00:00`)
      .lte('entry_time', `${today}T23:59:59`)
      .eq('is_recognized', true),
  ]);

  // 1. Build registered users list
  const processedUsers = (registeredRes.data || []).map(r => {
    const m = (r.device_info as any)?.metadata || {};
    return {
      id: r.id,
      user_id: r.user_id,
      employee_id: m.employee_id || '',
      name: m.name || '',
    };
  }).filter(u => u.name && u.name !== 'Unknown' && !u.name.toLowerCase().includes('unknown') && u.name !== 'User');

  // Deduplicate by employee_id
  const seen = new Set<string>();
  const uniqueUsers = processedUsers.filter(u => {
    const key = u.employee_id || u.user_id || u.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 2. Build present/late maps
  const presentMap = new Set<string>();
  const lateMap = new Set<string>();

  const normalizeStatus = (s: string) => {
    const lower = (s || '').toLowerCase().trim();
    if (lower === 'unauthorized' || lower.includes('present')) return 'present';
    if (lower.includes('late')) return 'late';
    return lower;
  };

  (todayRes.data || []).forEach(r => {
    const m = (r.device_info as any)?.metadata || {};
    const empId = m.employee_id || (r.device_info as any)?.employee_id || r.user_id;
    const normalized = normalizeStatus(r.status || '');
    if (empId) {
      if (normalized === 'present') { presentMap.add(empId); lateMap.delete(empId); }
      else if (normalized === 'late' && !presentMap.has(empId)) lateMap.add(empId);
    }
  });

  // Merge gate entries
  (gateRes.data || []).forEach(g => {
    if (g.student_id && !presentMap.has(g.student_id) && !lateMap.has(g.student_id)) {
      presentMap.add(g.student_id);
    }
  });

  // 3. Multi-identifier matching
  let totalPresent = 0;
  let totalLate = 0;
  uniqueUsers.forEach(u => {
    const identifiers = [u.employee_id, u.user_id, u.id].filter(Boolean);
    for (const id of identifiers) {
      if (!id) continue;
      if (presentMap.has(id)) { totalPresent++; return; }
      if (lateMap.has(id)) { totalLate++; return; }
    }
  });

  const totalRegistered = uniqueUsers.length;
  const absentToday = Math.max(0, totalRegistered - totalPresent - totalLate);
  const attendanceRate = totalRegistered > 0
    ? Math.round(((totalPresent + totalLate) / totalRegistered) * 100)
    : 0;

  return { totalRegistered, presentToday: totalPresent, lateToday: totalLate, absentToday, attendanceRate };
}
