import React, { useEffect, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import CaptureFaceDialog from './CaptureFaceDialog';
import IDCardAutoFillScanner, { IDCardExtractedFields } from '@/components/register/IDCardAutoFillScanner';
import { uploadImage } from '@/services/face-recognition/StorageService';

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
  const [detailsForm, setDetailsForm] = useState({
    roll_number: '',
    blood_group: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    transport_mode: '',
    address: '',
  });

  const dataUrlToFile = (dataUrl: string, filename: string) => {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(b64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  };

  const updateStudentPhotoFromIdScan = async (studentPhotoDataUrl: string) => {
    const identity = (selectedFace?.employee_id || selectedFace?.user_id || '').trim();
    if (!identity) return;

    const file = dataUrlToFile(studentPhotoDataUrl, `${identity}-id-scan.jpg`);
    const photoUrl = await uploadImage(file, `id-card-updates/${Date.now()}-${identity}.jpg`, 'face-images');

    let attendanceQuery = supabase.from('attendance_records').update({ image_url: photoUrl });
    let descriptorQuery = supabase.from('face_descriptors').update({ image_url: photoUrl });

    if (selectedFace?.user_id) {
      attendanceQuery = attendanceQuery.eq('user_id', selectedFace.user_id);
      descriptorQuery = descriptorQuery.eq('user_id', selectedFace.user_id);
    } else {
      attendanceQuery = attendanceQuery.eq('student_id', selectedFace?.employee_id || '');
      descriptorQuery = descriptorQuery.eq('student_id', selectedFace?.employee_id || '');
    }

    const [{ error: attendanceError }, { error: descriptorError }] = await Promise.all([
      attendanceQuery,
      descriptorQuery,
    ]);

    if (attendanceError) throw attendanceError;
    if (descriptorError) throw descriptorError;
  };

  const handleIdCardExtracted = async (f: IDCardExtractedFields) => {
    setDetailsForm((prev) => ({
      ...prev,
      roll_number: f.roll_number || prev.roll_number,
      blood_group: f.blood_group || prev.blood_group,
      parent_name: f.parent_name || prev.parent_name,
      parent_phone: f.parent_phone || prev.parent_phone,
      parent_email: f.parent_email || prev.parent_email,
      transport_mode: f.transport_mode || prev.transport_mode,
      address: f.address || prev.address,
    }));

    setEditingDetails(true);

    if (f.student_photo_data_url) {
      try {
        await updateStudentPhotoFromIdScan(f.student_photo_data_url);
        await refreshSelectedFace();
        toast({
          title: 'Photo replaced',
          description: 'ID-card photo has been updated in face samples.',
        });
      } catch (error: any) {
        console.error('Failed to replace student photo from ID scan:', error);
        toast({
          title: 'Photo replace failed',
          description: error?.message || 'Could not update photo right now.',
          variant: 'destructive',
        });
      }
    }

    toast({
      title: 'Details extracted',
      description: 'ID-card data filled. Review and press Save.',
    });
  };

  useEffect(() => {
    if (!selectedFace) return;
    setDetailsForm({
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
        const updatedInfo = {
          ...existing,
          metadata: {
            ...metadata,
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
          .update({ device_info: updatedInfo })
          .eq('id', row.id);
      }

      await supabase
        .from('profiles')
        .update({
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
            <IDCardAutoFillScanner onExtracted={handleIdCardExtracted} />

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
