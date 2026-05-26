import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  GripHorizontal,
  LayoutGrid,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Upload,
  UserX,
  Users,
  X
} from 'lucide-react';

const gridBg = `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1.5' fill='%23cbd5e1'/%3E%3C/svg%3E")`;

const createStudentId = (index = 0) => `stu_${Date.now()}_${index}`;
const createDeskId = (index = 0) => `desk_${Date.now()}_${index}`;

const escapeCsvValue = (value) => {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);

export default function ClassroomPlanner() {
  const singleDeskWidth = 110;
  const doubleDeskWidth = 220;
  const deskHeight = 110;
  const rowGap = 110;
  const snapThreshold = 18;
  const alignmentThreshold = 20;

  const [students, setStudents] = useState([
    { id: 's1', name: 'Alice Smith' },
    { id: 's2', name: 'Bob Jones' },
    { id: 's3', name: 'Charlie Brown' },
    { id: 's4', name: 'Diana Prince' },
    { id: 's5', name: 'Evan Wright' },
  ]);
  const [desks, setDesks] = useState([
    { id: 'd1', type: 2, x: 300, y: 200, rotation: 0, seats: ['d1_s1', 'd1_s2'] },
    { id: 'd2', type: 2, x: 600, y: 200, rotation: 0, seats: ['d2_s1', 'd2_s2'] },
    { id: 'd3', type: 1, x: 450, y: 400, rotation: 0, seats: ['d3_s1'] },
  ]);
  const [assignments, setAssignments] = useState({});
  const [newStudentName, setNewStudentName] = useState('');
  const [seatsPerRow, setSeatsPerRow] = useState('6');
  const [rowCount, setRowCount] = useState('3');
  const [warning, setWarning] = useState('');
  const [activeDragDesk, setActiveDragDesk] = useState(null);
  const [selectedDeskId, setSelectedDeskId] = useState(null);

  const studentImportRef = useRef(null);
  const planImportRef = useRef(null);

  const setNotice = (message) => {
    setWarning(message);
  };

  const getStudentName = (studentId) => students.find((student) => student.id === studentId)?.name ?? '';

  const findSeatForStudent = (studentId, currentAssignments) =>
    Object.keys(currentAssignments).find((seatId) => currentAssignments[seatId] === studentId);

  const getDeskCellOffsets = (desk) => {
    if (desk.type === 1) {
      return [{ x: 0, y: 0 }];
    }

    const normalizedRotation = ((desk.rotation % 360) + 360) % 360;

    if (normalizedRotation === 90) {
      return [
        { x: 0, y: -singleDeskWidth / 2 },
        { x: 0, y: singleDeskWidth / 2 }
      ];
    }

    if (normalizedRotation === 180) {
      return [
        { x: singleDeskWidth / 2, y: 0 },
        { x: -singleDeskWidth / 2, y: 0 }
      ];
    }

    if (normalizedRotation === 270) {
      return [
        { x: 0, y: singleDeskWidth / 2 },
        { x: 0, y: -singleDeskWidth / 2 }
      ];
    }

    return [
      { x: -singleDeskWidth / 2, y: 0 },
      { x: singleDeskWidth / 2, y: 0 }
    ];
  };

  const getDeskCells = (desk, centerX = desk.x, centerY = desk.y) =>
    getDeskCellOffsets(desk).map((offset, index) => ({
      id: `${desk.id}_cell_${index}`,
      x: centerX + offset.x,
      y: centerY + offset.y
    }));

  const snapDeskPosition = (movingDesk, proposedX, proposedY, otherDesks) => {
    const movingCells = getDeskCells(movingDesk, proposedX, proposedY);
    const otherCells = otherDesks.flatMap((desk) => getDeskCells(desk));
    const directions = [
      { x: singleDeskWidth, y: 0 },
      { x: -singleDeskWidth, y: 0 },
      { x: 0, y: singleDeskWidth },
      { x: 0, y: -singleDeskWidth }
    ];

    let bestCandidate = null;

    movingCells.forEach((movingCell) => {
      otherCells.forEach((otherCell) => {
        directions.forEach((direction) => {
          const targetCellX = otherCell.x + direction.x;
          const targetCellY = otherCell.y + direction.y;
          const deltaX = targetCellX - movingCell.x;
          const deltaY = targetCellY - movingCell.y;

          if (Math.abs(deltaX) > snapThreshold || Math.abs(deltaY) > snapThreshold) {
            return;
          }

          const candidateX = proposedX + deltaX;
          const candidateY = proposedY + deltaY;
          const candidateCells = getDeskCells(movingDesk, candidateX, candidateY);
          const overlapsExistingDesk = candidateCells.some((candidateCell) =>
            otherCells.some(
              (other) =>
                Math.abs(candidateCell.x - other.x) < 1 &&
                Math.abs(candidateCell.y - other.y) < 1
            )
          );

          if (overlapsExistingDesk) {
            return;
          }

          const candidateDistance = Math.hypot(deltaX, deltaY);

          if (!bestCandidate || candidateDistance < bestCandidate.distance) {
            bestCandidate = {
              x: candidateX,
              y: candidateY,
              distance: candidateDistance
            };
          }
        });
      });
    });

    if (bestCandidate) {
      return { x: bestCandidate.x, y: bestCandidate.y };
    }

    const alignedX = otherCells.find((cell) => Math.abs(cell.x - proposedX) <= alignmentThreshold)?.x;
    const alignedY = otherCells.find((cell) => Math.abs(cell.y - proposedY) <= alignmentThreshold)?.y;

    return {
      x: alignedX ?? proposedX,
      y: alignedY ?? proposedY
    };
  };

  const handleAddStudent = (event) => {
    event.preventDefault();
    const namesToAdd = newStudentName
      .split(/[;,]/)
      .map((name) => name.trim())
      .filter(Boolean);

    if (namesToAdd.length === 0) return;

    setStudents((prev) => [
      ...prev,
      ...namesToAdd.map((name, index) => ({ id: createStudentId(prev.length + index), name }))
    ]);
    setNewStudentName('');
    setNotice('');
  };

  const unassignStudent = (studentId) => {
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((seatId) => {
        if (next[seatId] === studentId) {
          delete next[seatId];
        }
      });
      return next;
    });
  };

  const removeStudent = (studentId) => {
    setStudents((prev) => prev.filter((student) => student.id !== studentId));
    unassignStudent(studentId);
  };

  const clearStudentList = () => {
    setStudents([]);
    setAssignments({});
    setNotice('');
  };

  const clearAllDesks = () => {
    setDesks([]);
    setAssignments({});
    setSelectedDeskId(null);
    setActiveDragDesk(null);
    setNotice('');
  };

  const createDesk = (type, x, y, index) => {
    const newId = createDeskId(index);
    return {
      id: newId,
      type,
      x,
      y,
      rotation: 0,
      seats: type === 1 ? [`${newId}_s1`] : [`${newId}_s1`, `${newId}_s2`]
    };
  };

  const addDesk = (type) => {
    const newDesk = createDesk(
      type,
      window.innerWidth / 2 || 400,
      window.innerHeight / 2 || 300,
      desks.length
    );

    setDesks((prev) => [...prev, newDesk]);
    setSelectedDeskId(newDesk.id);
    setNotice('');
  };

  const generateDeskRows = () => {
    const seatsValue = Number.parseInt(seatsPerRow, 10);
    const rowsValue = Number.parseInt(rowCount, 10);

    if (!Number.isFinite(seatsValue) || !Number.isFinite(rowsValue) || seatsValue <= 0 || rowsValue <= 0) {
      setNotice('Please enter a whole number greater than 0 for seats per row and rows.');
      return;
    }

    const rowDeskConfigs = [];
    let remainingSeats = seatsValue;

    while (remainingSeats >= 2) {
      rowDeskConfigs.push({ type: 2, width: doubleDeskWidth });
      remainingSeats -= 2;
    }

    if (remainingSeats === 1) {
      rowDeskConfigs.push({ type: 1, width: singleDeskWidth });
    }

    const totalRowWidth = rowDeskConfigs.reduce((sum, desk) => sum + desk.width, 0);
    const canvasCenterX = window.innerWidth * 0.6 || 700;
    const canvasCenterY = window.innerHeight * 0.4 || 320;
    const startX = canvasCenterX - totalRowWidth / 2;
    const startY = canvasCenterY - (((rowsValue - 1) * (deskHeight + rowGap)) / 2);
    const createdDesks = [];

    for (let rowIndex = 0; rowIndex < rowsValue; rowIndex += 1) {
      let cursorX = startX;

      rowDeskConfigs.forEach((deskConfig) => {
        const centerX = cursorX + deskConfig.width / 2;
        const centerY = startY + rowIndex * (deskHeight + rowGap);

        createdDesks.push(
          createDesk(deskConfig.type, centerX, centerY, desks.length + createdDesks.length)
        );

        cursorX += deskConfig.width;
      });
    }

    if (createdDesks.length === 0) {
      setNotice('No desks were generated from the current row settings.');
      return;
    }

    setDesks((prev) => [...prev, ...createdDesks]);
    setSelectedDeskId(createdDesks[createdDesks.length - 1]?.id ?? null);
    setNotice(`Added ${createdDesks.length} desks across ${rowsValue} row${rowsValue === 1 ? '' : 's'}.`);
  };

  const removeDesk = (deskId) => {
    const deskToRemove = desks.find((desk) => desk.id === deskId);

    if (deskToRemove) {
      setAssignments((prev) => {
        const next = { ...prev };
        deskToRemove.seats.forEach((seatId) => delete next[seatId]);
        return next;
      });
    }

    setDesks((prev) => prev.filter((desk) => desk.id !== deskId));
    setSelectedDeskId((prev) => (prev === deskId ? null : prev));
  };

  const rotateDesk = (deskId) => {
    setDesks((prev) =>
      prev.map((desk) => (desk.id === deskId ? { ...desk, rotation: (desk.rotation + 90) % 360 } : desk))
    );
    setSelectedDeskId(deskId);
  };

  const handleDeskPointerDown = (event, desk) => {
    if (event.button !== 0) return;
    if (event.target.closest('.no-drag')) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    setSelectedDeskId(desk.id);
    setActiveDragDesk({
      id: desk.id,
      pointerId: event.pointerId,
      startX: desk.x,
      startY: desk.y,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY
    });
  };

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!activeDragDesk) return;
      if (activeDragDesk.pointerId !== undefined && event.pointerId !== activeDragDesk.pointerId) return;

      const dx = event.clientX - activeDragDesk.pointerStartX;
      const dy = event.clientY - activeDragDesk.pointerStartY;
      const movingDesk = desks.find((desk) => desk.id === activeDragDesk.id);

      if (!movingDesk) return;

      const proposedX = activeDragDesk.startX + dx;
      const proposedY = activeDragDesk.startY + dy;
      const snappedPosition = snapDeskPosition(
        movingDesk,
        proposedX,
        proposedY,
        desks.filter((desk) => desk.id !== activeDragDesk.id)
      );

      setDesks((prev) =>
        prev.map((desk) =>
          desk.id === activeDragDesk.id
            ? { ...desk, x: snappedPosition.x, y: snappedPosition.y }
            : desk
        )
      );
    };

    const handlePointerUp = (event) => {
      if (!activeDragDesk) return;
      if (activeDragDesk.pointerId !== undefined && event.pointerId !== activeDragDesk.pointerId) return;
      setActiveDragDesk(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeDragDesk, desks]);

  const moveStudentToSeat = ({ studentId, targetSeatId, fromSeatId = null }) => {
    setAssignments((prev) => {
      const next = { ...prev };
      const sourceSeatId = fromSeatId || findSeatForStudent(studentId, next);
      const displacedStudentId = next[targetSeatId];

      if (sourceSeatId === targetSeatId) {
        return prev;
      }

      if (sourceSeatId) {
        delete next[sourceSeatId];
      }

      if (displacedStudentId && displacedStudentId !== studentId) {
        if (sourceSeatId) {
          next[sourceSeatId] = displacedStudentId;
        } else {
          delete next[targetSeatId];
        }
      }

      Object.keys(next).forEach((seatId) => {
        if (seatId !== sourceSeatId && seatId !== targetSeatId && next[seatId] === studentId) {
          delete next[seatId];
        }
      });

      next[targetSeatId] = studentId;
      return next;
    });

    setNotice('');
  };

  const clearAllAssignments = () => {
    setAssignments({});
    setNotice('');
  };

  const handleRandomize = () => {
    const allSeats = desks.flatMap((desk) => desk.seats);
    const allStudentIds = students.map((student) => student.id);

    if (allStudentIds.length > allSeats.length) {
      setNotice(`Warning: ${allStudentIds.length} students but only ${allSeats.length} seats. Some will remain unassigned.`);
    } else {
      setNotice('');
    }

    const shuffledStudents = [...allStudentIds].sort(() => Math.random() - 0.5);
    const newAssignments = {};
    const assignCount = Math.min(shuffledStudents.length, allSeats.length);

    for (let index = 0; index < assignCount; index += 1) {
      newAssignments[allSeats[index]] = shuffledStudents[index];
    }

    setAssignments(newAssignments);
  };

  const handleStudentDragStart = (event, payload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/classroom-planner-student', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', payload.studentId);
  };

  const handleAssignedStudentPointerDown = (event) => {
    event.stopPropagation();
    setSelectedDeskId(null);
  };

  const readDraggedStudent = (event) => {
    const rawPayload = event.dataTransfer.getData('application/classroom-planner-student');
    if (!rawPayload) return null;

    try {
      return JSON.parse(rawPayload);
    } catch {
      return null;
    }
  };

  const handleSeatDrop = (event, seatId) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = readDraggedStudent(event);
    if (!payload?.studentId) return;

    moveStudentToSeat({
      studentId: payload.studentId,
      targetSeatId: seatId,
      fromSeatId: payload.fromSeatId ?? null
    });
  };

  const handleBackgroundDrop = (event) => {
    event.preventDefault();

    const payload = readDraggedStudent(event);
    if (!payload?.studentId) return;

    unassignStudent(payload.studentId);
    setNotice('');
  };

  const handleStudentImport = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  const importedNames = text
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);

  if (importedNames.length === 0) {
    setNotice('The selected TXT file did not contain any student names.');
    event.target.value = '';
    return;
  }

  setStudents((prev) => {
    const existingNames = new Set(prev.map((s) => s.name));

    // Also deduplicate inside the imported file itself
    const uniqueImportedNames = [...new Set(importedNames)];

    const newStudents = uniqueImportedNames
      .filter((name) => !existingNames.has(name))
      .map((name, index) => ({
        id: createStudentId(prev.length + index), // safe because we only add new ones
        name,
      }));

    return [...prev, ...newStudents];
  });

  setNotice(`Imported ${importedNames.length} students (only new ones added).`);
  event.target.value = '';
};

  const exportSeatingPlan = () => {
    const rows = [
      ['desk_id', 'desk_type', 'x', 'y', 'rotation', 'seat_1_student', 'seat_2_student']
    ];

    desks.forEach((desk) => {
      rows.push([
        desk.id,
        desk.type,
        Math.round(desk.x),
        Math.round(desk.y),
        desk.rotation,
        getStudentName(assignments[desk.seats[0]]) || '',
        desk.seats[1] ? getStudentName(assignments[desk.seats[1]]) || '' : ''
      ]);
    });

    const csvContent = rows
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'classroom-seating-plan.csv';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Seating plan exported as CSV.');
  };

  const handlePlanImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length < 2) {
      setNotice('The selected CSV file is empty or missing seating-plan rows.');
      event.target.value = '';
      return;
    }

    const header = rows[0].map((cell) => cell.trim().toLowerCase());
    const isExpectedHeader =
      header[0] === 'desk_id' &&
      header[1] === 'desk_type' &&
      header[2] === 'x' &&
      header[3] === 'y' &&
      header[4] === 'rotation' &&
      header[5] === 'seat_1_student' &&
      header[6] === 'seat_2_student';

    if (!isExpectedHeader) {
      setNotice('CSV format not recognized. Please import a file exported by this planner.');
      event.target.value = '';
      return;
    }

    const importedDesks = [];
    const importedAssignments = {};
    const importedStudents = [];
    const studentNameMap = new Map();

    rows.slice(1).forEach((row, index) => {
      const deskId = row[0]?.trim() || createDeskId(index);
      const deskType = Number(row[1]);
      const type = deskType === 1 ? 1 : 2;
      const seats = type === 1 ? [`${deskId}_s1`] : [`${deskId}_s1`, `${deskId}_s2`];

      importedDesks.push({
        id: deskId,
        type,
        x: Number(row[2]) || 400,
        y: Number(row[3]) || 300,
        rotation: Number(row[4]) || 0,
        seats
      });

      let studentIDCounter = importedStudents.length
      seats.forEach((seatId, seatIndex) => {
        console.log("Seats for each", seatId, seatIndex);
        const studentName = row[5 + seatIndex]?.trim();
        if (!studentName) return;

        if (!studentNameMap.has(studentName)) {
          const studentId = createStudentId(studentIDCounter++);
          console.log("New student", studentName, studentId);
          studentNameMap.set(studentName, studentId);
          importedStudents.push({ id: studentId, name: studentName });
        }else{
          console.log("Student name already exists", studentName);
        }

        importedAssignments[seatId] = studentNameMap.get(studentName);
      });
    });

    setDesks(importedDesks);
    setStudents(importedStudents);
    setAssignments(importedAssignments);
    setSelectedDeskId(null);
    setActiveDragDesk(null);
    setNotice(`Imported seating plan with ${importedDesks.length} desks and ${importedStudents.length} assigned students.`);
    event.target.value = '';
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 font-sans text-slate-800">
      <input
        ref={studentImportRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleStudentImport}
      />
      <input
        ref={planImportRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handlePlanImport}
      />

      <div className="z-10 flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 z-20 border-b border-slate-100 bg-slate-50 p-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-700">
            <LayoutGrid className="text-blue-500" />
            Classroom Planner
          </h1>
        </div>

        <div className="border-b border-slate-100 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Add Desks</h2>
          <div className="flex gap-2">
            <button
              onClick={() => addDesk(1)}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-amber-200 bg-amber-50 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
            >
              <Plus size={16} /> 1 Seat
            </button>
            <button
              onClick={() => addDesk(2)}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-amber-200 bg-amber-50 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
            >
              <Plus size={16} /> 2 Seats
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Generate Rows</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Seats per row
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={seatsPerRow}
                  onChange={(event) => setSeatsPerRow(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Rows
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rowCount}
                  onChange={(event) => setRowCount(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
            <button
              onClick={generateDeskRows}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
            >
              <Plus size={16} /> Generate Desk Rows
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Uses 2-seat desks by default. If seats per row is odd, each row ends with one 1-seat desk.
            </p>
          </div>
        </div>

        <div className="border-b border-slate-100 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Arrangement</h2>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRandomize}
              className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Shuffle size={18} /> Randomize Seats
            </button>
            <button
              onClick={clearAllAssignments}
              className="flex w-full items-center justify-center gap-2 rounded bg-slate-100 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-200"
            >
              <UserX size={16} /> Clear Assignments
            </button>
            <button
              onClick={clearStudentList}
              className="flex w-full items-center justify-center gap-2 rounded bg-red-50 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100"
            >
              <Trash2 size={16} /> Clear Student List
            </button>
            <button
              onClick={clearAllDesks}
              className="flex w-full items-center justify-center gap-2 rounded bg-red-50 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100"
            >
              <Trash2 size={16} /> Clear All Desks
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Import / Export</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => studentImportRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
            >
              <Upload size={16} /> Students TXT
            </button>
            <button
              onClick={() => planImportRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 shadow-sm transition-colors hover:bg-sky-100"
            >
              <Upload size={16} /> Plan CSV
            </button>
            <button
              onClick={exportSeatingPlan}
              className="col-span-2 flex items-center justify-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              <Download size={16} /> Export Current Plan CSV
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="p-4 pb-2">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Users size={16} /> Students ({students.length})
            </h2>
            <form onSubmit={handleAddStudent} className="mb-2 flex gap-2">
              <input
                type="text"
                value={newStudentName}
                onChange={(event) => setNewStudentName(event.target.value)}
                placeholder="New student name, or multiple with , or ;"
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="rounded bg-slate-800 p-2 text-white transition-colors hover:bg-slate-700">
                <Plus size={18} />
              </button>
            </form>
            <p className="mb-2 text-xs text-slate-400">Drag students from the list or between seats. You can also paste multiple names separated by commas or semicolons.</p>
          </div>

          <ul className="space-y-2 px-4 pb-4">
            {students.map((student) => {
              const isAssigned = Object.values(assignments).includes(student.id);

              return (
                <li
                  key={student.id}
                  draggable
                  onDragStart={(event) =>
                    handleStudentDragStart(event, {
                      source: 'sidebar',
                      studentId: student.id
                    })
                  }
                  className={`flex cursor-grab items-center justify-between rounded-lg border p-3 transition-all active:cursor-grabbing ${
                    isAssigned
                      ? 'border-slate-200 bg-slate-50 opacity-60 hover:opacity-80'
                      : 'border-blue-200 bg-white hover:border-blue-400 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <GripHorizontal size={16} className="shrink-0 text-slate-400" />
                    <div className="flex flex-col truncate">
                      <span className={`truncate font-medium ${isAssigned ? 'text-slate-500' : 'text-slate-800'}`}>
                        {student.name}
                      </span>
                      {isAssigned && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Seated</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeStudent(student.id)}
                    className="shrink-0 p-1 text-slate-300 transition-colors hover:text-red-500"
                    title="Remove student"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}

            {students.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                No students added yet.
              </div>
            )}
          </ul>
        </div>
      </div>

      <div
        className="relative flex-1"
        style={{ backgroundImage: gridBg }}
        onPointerDown={() => setSelectedDeskId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleBackgroundDrop}
      >
        {warning && (
          <div className="absolute left-1/2 top-6 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 shadow-lg">
            <span className="text-sm font-medium">{warning}</span>
            <button
              onClick={() => setWarning('')}
              className="rounded p-1 text-red-500 transition-colors hover:bg-red-100"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {desks.map((desk) => {
          const showDeskControls = selectedDeskId === desk.id || activeDragDesk?.id === desk.id;

          return (
            <div
              key={desk.id}
              className={`group absolute flex items-center justify-center rounded-lg border-b-4 border-amber-800 bg-amber-600 shadow-xl transition-shadow ${
                activeDragDesk?.id === desk.id
                  ? 'z-40 scale-105 ring-4 ring-blue-400/50'
                  : showDeskControls
                    ? 'z-30 shadow-2xl ring-2 ring-blue-300/60'
                    : 'z-20 hover:z-30'
              }`}
              style={{
                left: desk.x,
                top: desk.y,
                transform: `translate(-50%, -50%) rotate(${desk.rotation}deg)`,
                width: desk.type === 1 ? '110px' : '220px',
                height: '110px',
                touchAction: 'none',
                userSelect: 'none'
              }}
              onPointerDown={(event) => handleDeskPointerDown(event, desk)}
            >
              <div className="absolute -top-12 left-0 right-0 flex h-12 items-start justify-center">
                <div
                  className={`no-drag flex gap-2 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-lg transition-all ${
                    showDeskControls
                      ? 'translate-y-0 opacity-100'
                      : 'pointer-events-none translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'
                  }`}
                >
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    rotateDesk(desk.id);
                  }}
                  className="rounded-full p-1.5 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  title="Rotate desk"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    removeDesk(desk.id);
                  }}
                  className="rounded-full p-1.5 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Delete desk"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              </div>

              <div className="flex h-full w-full gap-3 p-3">
                {desk.seats.map((seatId) => {
                  const assignedStudentId = assignments[seatId];
                  const student = assignedStudentId ? students.find((item) => item.id === assignedStudentId) : null;

                  return (
                    <div
                      key={seatId}
                      className="relative flex flex-1 items-center justify-center overflow-hidden rounded border-2 border-dashed border-amber-300/50 bg-amber-50 shadow-inner transition-colors"
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(event) => handleSeatDrop(event, seatId)}
                    >
                      {student ? (
                        <div
                          draggable
                          onPointerDown={handleAssignedStudentPointerDown}
                          onDragStart={(event) =>
                            handleStudentDragStart(event, {
                              source: 'seat',
                              studentId: student.id,
                              fromSeatId: seatId
                            })
                          }
                          className="group/student absolute inset-1 z-10 flex cursor-grab items-center justify-center rounded bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-500 active:cursor-grabbing"
                        >
                          <span className="px-1 text-center text-xs font-bold leading-tight drop-shadow-sm">
                            {student.name}
                          </span>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              unassignStudent(student.id);
                            }}
                            className="absolute inset-0 flex items-center justify-center rounded bg-red-600/90 text-white opacity-0 transition-opacity group-hover/student:opacity-100"
                            title="Unassign"
                          >
                            <UserX size={18} />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="text-xs font-bold uppercase tracking-widest text-amber-700/30"
                          style={{ transform: `rotate(-${desk.rotation}deg)` }}
                        >
                          Seat
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {desks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-6 py-4 font-medium text-slate-500 shadow-sm backdrop-blur">
              <Plus className="text-amber-500" />
              Add desks from the sidebar to begin
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
