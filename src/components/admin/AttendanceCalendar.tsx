import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useAttendanceCalendar } from './hooks/useAttendanceCalendar';
import StudentInfoCard from './StudentInfoCard';
import DailyAttendanceDetails from './DailyAttendanceDetails';
import AttendanceCalendarView from './AttendanceCalendarView';
import ReportControls from './ReportControls';
import { CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import CaptureFaceDialog from './CaptureFaceDialog';
import IDCardAutoFillScanner, { IDCardExtractedFields } from '@/components/register/IDCardAutoFillScanner';
import { CLASSES, SECTIONS } from '@/constants/schoolConfig';
import { resolveStudentPhotoUrl } from '@/utils/studentPhotoResolver';

interface AttendanceCalendarProps {
  selectedFaceId: string | null;
}

const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ selectedFaceId }) => {
  const { toast } = useToast();
  const {
    attendanceDays,
    lateAttendanceDays,
    absentDays,
    selectedFace,
    selectedDate,
    setSelectedDate,
    dailyAttendance,
    workingDays,
    isDateInArray,
    attendanceRecords,
    refreshSelectedFace,
  } = useAttendanceCalendar(selectedFaceId);

  const [editingDetails, setEditingDetails] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [detailsForm, setDetailsForm] = useState({
    class_name: '',
    section: '',
    roll_number: '',
    blood_group: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    transport_mode: '',
    address: '',
  });
  const [availablePhotoOptions, setAvailablePhotoOptions] = useState<Array<{ value: string; label: string; preview: string }>>([]);
  const [selectedPhotoValue, setSelectedPhotoValue] = useState('');
  const [loadingPhotoOptions, setLoadingPhotoOptions] = useState(false);
  const [applyingPhoto, setApplyingPhoto] = useState(false);

  const parseClassSection = (value?: string) => {
    const raw = (value || '').trim();
    if (!raw) return { class_name: '', section: '' };

    const combinedMatch = raw.match(/(?:class|grade|std|standard)?\s*(\d{1,2})\s*[-/ ]\s*([a-z])/i);
    if (combinedMatch) {
      return {
        class_name: combinedMatch[1],
        section: combinedMatch[2].toUpperCase(),
      };
    }

    const classOnly = raw.match(/(?:class|grade|std|standard)?\s*(\d{1,2})/i)?.[1] || '';
    const sectionOnly = raw.match(/(?:section|sec)\s*([a-z])/i)?.[1]?.toUpperCase() || '';
    return { class_name: classOnly, section: sectionOnly };
  };

  const normalizePhotoRef = (value?: string | null) => (value || '').trim();

  const applyStudentPhotoReference = useCallback(async (photoRef: string) => {
    const normalized = normalizePhotoRef(photoRef);
    if (!normalized || !selectedFace) return;

    setApplyingPhoto(true);
    try {
      let attendanceQuery = supabase.from('attendance_records').update({ image_url: normalized });
      let descriptorQuery = supabase.from('face_descriptors').update({ image_url: normalized });

      if (selectedFace.user_id) {
        attendanceQuery = attendanceQuery.eq('user_id', selectedFace.user_id);
        descriptorQuery = descriptorQuery.eq('user_id', selectedFace.user_id);
      } else {
        attendanceQuery = attendanceQuery.eq('student_id', selectedFace.employee_id || '');
        descriptorQuery = descriptorQuery.eq('student_id', selectedFace.employee_id || '');
      }

      const profileQuery = selectedFace.user_id
        ? supabase.from('profiles').update({ avatar_url: normalized }).eq('user_id', selectedFace.user_id)
        : Promise.resolve({ error: null } as { error: null });

      const [{ error: attendanceError }, { error: descriptorError }, profileRes] = await Promise.all([
        attendanceQuery,
        descriptorQuery,
        profileQuery,
      ]);

      if (attendanceError) throw attendanceError;
      if (descriptorError) throw descriptorError;
      if (profileRes?.error) throw profileRes.error;

      await refreshSelectedFace();
      toast({
        title: 'Profile photo updated',
        description: 'Selected photo is now active for this student.',
      });
    } catch (error: any) {
      console.error('Failed to apply student photo:', error);
      toast({
        title: 'Photo update failed',
        description: error?.message || 'Could not apply this photo right now.',
        variant: 'destructive',
      });
    } finally {
      setApplyingPhoto(false);
    }
  }, [refreshSelectedFace, selectedFace, toast]);

  const loadAvailablePhotoOptions = useCallback(async () => {
    if (!selectedFace) {
      setAvailablePhotoOptions([]);
      setSelectedPhotoValue('');
      return;
    }

    setLoadingPhotoOptions(true);
    try {
      const rawCandidates: string[] = [];
      const seen = new Set<string>();
      const pushCandidate = (value?: string | null) => {
        const normalized = normalizePhotoRef(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        rawCandidates.push(normalized);
      };

      pushCandidate(selectedFace.image_url);

      let attendanceQuery = supabase
        .from('attendance_records')
        .select('image_url, timestamp')
        .not('image_url', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(20);

      let descriptorsQuery = supabase
        .from('face_descriptors')
        .select('image_url, created_at')
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (selectedFace.user_id) {
        attendanceQuery = attendanceQuery.eq('user_id', selectedFace.user_id);
        descriptorsQuery = descriptorsQuery.eq('user_id', selectedFace.user_id);
      } else {
        attendanceQuery = attendanceQuery.eq('student_id', selectedFace.employee_id || '');
        descriptorsQuery = descriptorsQuery.eq('student_id', selectedFace.employee_id || '');
      }

      const profileQuery = selectedFace.user_id
        ? supabase.from('profiles').select('avatar_url').eq('user_id', selectedFace.user_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: { avatar_url?: string | null } | null; error: null });

      const [{ data: attendancePhotos }, { data: descriptorPhotos }, { data: profilePhoto }] = await Promise.all([
        attendanceQuery,
        descriptorsQuery,
        profileQuery,
      ]);

      (attendancePhotos || []).forEach((row) => pushCandidate(row.image_url));
      (descriptorPhotos || []).forEach((row) => pushCandidate(row.image_url));
      pushCandidate(profilePhoto?.avatar_url);

      const options = await Promise.all(
        rawCandidates.slice(0, 12).map(async (raw, index) => ({
          value: raw,
          label: index === 0 ? 'Current photo' : `Saved photo ${index + 1}`,
          preview: await resolveStudentPhotoUrl(raw),
        })),
      );

      setAvailablePhotoOptions(options);
      setSelectedPhotoValue((prev) => (options.some((opt) => opt.value === prev) ? prev : options[0]?.value || ''));
    } catch (error) {
      console.error('Failed to load photo options:', error);
      setAvailablePhotoOptions([]);
      setSelectedPhotoValue('');
    } finally {
      setLoadingPhotoOptions(false);
    }
  }, [selectedFace]);

  const handleUploadPhoto = async (file: File) => {
    if (!selectedFace) return;

    setApplyingPhoto(true);
    try {
      const identity = (selectedFace.employee_id || selectedFace.user_id || selectedFace.recordId || 'student').trim();
      const sanitizedName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
      const storagePath = `faces/manual-updates/${Date.now()}-${identity}-${sanitizedName}`;
      const { data, error } = await supabase.storage
        .from('face-images')
        .upload(storagePath, file, { upsert: true, cacheControl: '3600' });

      if (error || !data?.path) throw error || new Error('Upload failed');

      await applyStudentPhotoReference(data.path);
      await loadAvailablePhotoOptions();
      setSelectedPhotoValue(data.path);
    } catch (error: any) {
      console.error('Failed to upload profile photo:', error);
      toast({
        title: 'Upload failed',
        description: error?.message || 'Could not upload the photo.',
        variant: 'destructive',
      });
    } finally {
      setApplyingPhoto(false);
    }
  };

  const handleIdCardExtracted = async (f: IDCardExtractedFields) => {
    const fromDepartment = parseClassSection(f.department);
    const fromPosition = parseClassSection(f.position);
    const extractedClass = fromDepartment.class_name || fromPosition.class_name;
    const extractedSection = fromDepartment.section || fromPosition.section;

    setDetailsForm((prev) => ({
      ...prev,
      class_name: extractedClass || prev.class_name,
      section: extractedSection || prev.section,
      roll_number: f.roll_number || prev.roll_number,
      blood_group: f.blood_group || prev.blood_group,
      parent_name: f.parent_name || prev.parent_name,
      parent_phone: f.parent_phone || prev.parent_phone,
      parent_email: f.parent_email || prev.parent_email,
      transport_mode: f.transport_mode || prev.transport_mode,
      address: f.address || prev.address,
    }));

    setEditingDetails(true);

    toast({
      title: 'Details extracted',
      description: 'ID-card data filled (including class/section). Review and press Save.',
    });
  };

  useEffect(() => {
    if (!selectedFace) return;
    setDetailsForm({
      class_name: selectedFace.class || '',
      section: selectedFace.section || '',
      roll_number: selectedFace.roll_number || '',
      blood_group: selectedFace.blood_group || '',
      parent_name: selectedFace.parent_name || '',
      parent_phone: selectedFace.parent_phone || '',
      parent_email: selectedFace.parent_email || '',
      transport_mode: selectedFace.transport_mode || '',
      address: selectedFace.address || '',
    });
    setEditingDetails(false);
    setShowDetailsPanel(false);
    loadAvailablePhotoOptions();
  }, [selectedFace?.recordId]);

  const studentForCapture = selectedFace?.user_id
    ? {
        id: selectedFace.user_id,
        user_id: selectedFace.user_id,
        name: selectedFace.name,
        employee_id: selectedFace.employee_id,
        roll_number: selectedFace.roll_number,
        parent_name: selectedFace.parent_name,
        parent_phone: selectedFace.parent_phone,
        parent_email: selectedFace.parent_email,
      }
    : null;

  const saveStudentDetails = async () => {
    if (!selectedFace?.user_id) {
      toast({ title: 'Unable to save', description: 'Student reference missing.', variant: 'destructive' });
      return;
    }

    setSavingDetails(true);
    try {
      const { data: rows, error: fetchErr } = await supabase
        .from('attendance_records')
        .select('id, device_info')
        .eq('user_id', selectedFace.user_id);
      if (fetchErr) throw fetchErr;

      for (const row of rows || []) {
        const existing = typeof row.device_info === 'string' ? JSON.parse(row.device_info) : (row.device_info || {});
        const metadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
        const classValue = detailsForm.class_name.trim();
        const sectionValue = detailsForm.section.trim().toUpperCase();
        const categoryValue = classValue && sectionValue ? `${classValue}-${sectionValue}` : existing?.category;
        const updatedInfo = {
          ...existing,
          category: categoryValue,
          metadata: {
            ...metadata,
            class: classValue,
            section: sectionValue,
            roll_number: detailsForm.roll_number.trim(),
            blood_group: detailsForm.blood_group.trim(),
            parent_name: detailsForm.parent_name.trim(),
            parent_phone: detailsForm.parent_phone.trim(),
            parent_email: detailsForm.parent_email.trim(),
            transport_mode: detailsForm.transport_mode.trim(),
            address: detailsForm.address.trim(),
          },
        };

        await supabase
          .from('attendance_records')
          .update({
            device_info: updatedInfo,
            class: classValue || null,
            section: sectionValue || null,
            category: categoryValue || null,
          })
          .eq('id', row.id);
      }

      await supabase
        .from('face_descriptors')
        .update({
          class: detailsForm.class_name.trim() || null,
          section: detailsForm.section.trim().toUpperCase() || null,
        })
        .eq('user_id', selectedFace.user_id);

      await supabase
        .from('profiles')
        .update({
          class: detailsForm.class_name.trim() || null,
          section: detailsForm.section.trim().toUpperCase() || null,
          parent_name: detailsForm.parent_name.trim(),
          parent_phone: detailsForm.parent_phone.trim(),
          parent_email: detailsForm.parent_email.trim(),
        })
        .eq('user_id', selectedFace.user_id);

      await refreshSelectedFace();

      toast({ title: 'Details updated', description: 'Student details saved successfully.' });
      setEditingDetails(false);
    } catch (error: any) {
      console.error('Failed to save student details:', error);
      toast({ title: 'Save failed', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingDetails(false);
    }
  };

  if (!selectedFaceId) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-dashed">
          <CardContent className="py-10 sm:py-16 flex flex-col items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-muted flex items-center justify-center">
              <CalendarDays className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-base sm:text-lg">No student selected</h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xs px-4">
                Select a student from the list to view their attendance calendar.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 sm:space-y-4"
    >
      {/* Student Header + Report Actions */}
      <StudentInfoCard
        selectedFace={selectedFace}
        attendanceDays={attendanceDays}
        lateAttendanceDays={lateAttendanceDays}
        absentDays={absentDays}
        workingDays={workingDays}
        reportControls={
          <ReportControls
            selectedFace={selectedFace}
            workingDays={workingDays}
            attendanceDays={attendanceDays}
            lateAttendanceDays={lateAttendanceDays}
            absentDays={absentDays}
            selectedDate={selectedDate}
            dailyAttendance={dailyAttendance}
          />
        }
      />

      {/* Student details editor + recapture flow */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (showDetailsPanel) setEditingDetails(false);
            setShowDetailsPanel((prev) => !prev);
          }}
        >
          {showDetailsPanel ? 'Hide Details' : 'View & Edit Details'}
        </Button>
      </div>

      {showDetailsPanel && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <IDCardAutoFillScanner
              onExtracted={handleIdCardExtracted}
              extractPhoto={false}
              showExtractedPhotoPreview={false}
            />

            <div className="space-y-2">
              <Label className="text-xs">Profile Photo</Label>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <Select value={selectedPhotoValue} onValueChange={setSelectedPhotoValue}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingPhotoOptions ? 'Loading saved photos…' : 'Select saved photo'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePhotoOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={applyingPhoto}
                >
                  Upload Photo
                </Button>
                <Button
                  type="button"
                  onClick={() => applyStudentPhotoReference(selectedPhotoValue)}
                  disabled={!selectedPhotoValue || applyingPhoto || loadingPhotoOptions}
                >
                  {applyingPhoto ? 'Applying…' : 'Use Selected'}
                </Button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUploadPhoto(file);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
              {selectedPhotoValue && (
                <div className="flex items-center gap-2 rounded-md border p-2 w-fit">
                  <img
                    src={availablePhotoOptions.find((p) => p.value === selectedPhotoValue)?.preview}
                    alt="Selected profile"
                    className="h-12 w-12 rounded object-cover"
                  />
                  <span className="text-xs text-muted-foreground">Selected photo preview</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Student Details</h3>
              <div className="flex items-center gap-2">
                {!editingDetails ? (
                  <Button size="sm" variant="outline" onClick={() => setEditingDetails(true)}>Edit Details</Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditingDetails(false)} disabled={savingDetails}>Cancel</Button>
                    <Button size="sm" onClick={saveStudentDetails} disabled={savingDetails}>
                      {savingDetails ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                )}
                <Button size="sm" onClick={() => setCaptureOpen(true)} disabled={!studentForCapture}>Recapture Face</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Class</Label>
                <Select
                  value={detailsForm.class_name || '__none'}
                  onValueChange={(v) => setDetailsForm((p) => ({ ...p, class_name: v === '__none' ? '' : v }))}
                  disabled={!editingDetails}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {CLASSES.map((cls) => (
                      <SelectItem key={cls} value={String(cls)}>{`Class ${cls}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Section</Label>
                <Select
                  value={detailsForm.section || '__none'}
                  onValueChange={(v) => setDetailsForm((p) => ({ ...p, section: v === '__none' ? '' : v }))}
                  disabled={!editingDetails}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {SECTIONS.map((section) => (
                      <SelectItem key={section} value={section}>{section}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Roll Number</Label>
                <Input value={detailsForm.roll_number} onChange={(e) => setDetailsForm((p) => ({ ...p, roll_number: e.target.value }))} disabled={!editingDetails} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Blood Group</Label>
                <Input value={detailsForm.blood_group} onChange={(e) => setDetailsForm((p) => ({ ...p, blood_group: e.target.value }))} disabled={!editingDetails} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parent Name</Label>
                <Input value={detailsForm.parent_name} onChange={(e) => setDetailsForm((p) => ({ ...p, parent_name: e.target.value }))} disabled={!editingDetails} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parent Phone</Label>
                <Input value={detailsForm.parent_phone} onChange={(e) => setDetailsForm((p) => ({ ...p, parent_phone: e.target.value }))} disabled={!editingDetails} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parent Email</Label>
                <Input type="email" value={detailsForm.parent_email} onChange={(e) => setDetailsForm((p) => ({ ...p, parent_email: e.target.value }))} disabled={!editingDetails} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Transport Mode</Label>
                <Input value={detailsForm.transport_mode} onChange={(e) => setDetailsForm((p) => ({ ...p, transport_mode: e.target.value }))} disabled={!editingDetails} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={detailsForm.address} onChange={(e) => setDetailsForm((p) => ({ ...p, address: e.target.value }))} disabled={!editingDetails} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar + Daily Details — stack on mobile, side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="lg:col-span-3">
          <AttendanceCalendarView
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            attendanceDays={attendanceDays}
            lateAttendanceDays={lateAttendanceDays}
            absentDays={absentDays}
            attendanceRecords={attendanceRecords}
          />
        </div>
        <div className="lg:col-span-2">
          <DailyAttendanceDetails
            selectedDate={selectedDate}
            dailyAttendance={dailyAttendance}
            isDateInArray={isDateInArray}
            attendanceDays={attendanceDays}
            lateAttendanceDays={lateAttendanceDays}
            absentDays={absentDays}
            selectedFaceId={selectedFaceId}
            selectedUserName={selectedFace?.name}
          />
        </div>
      </div>

      <CaptureFaceDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        student={studentForCapture as any}
        onSuccess={refreshSelectedFace}
      />
    </motion.div>
  );
};

export default AttendanceCalendar;
