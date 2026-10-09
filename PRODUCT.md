# SafeTap product brief

SafeTap helps CICS administrators and IT/CS class representatives record class attendance and identify students who have arrived at an assembly point. Representatives usually scan on a phone while administrators review the overview on a larger screen.

The main jobs are to prepare attendance, start an evacuation, scan IDs, review students still missing, and upload records saved during a connection drop. One student contributes one arrival per event. Students outside the expected list are counted separately. Floor 5 (CAFAD) is excluded. A last recorded classroom never proves current location or room clearance.

Navigation uses Overview, Attendance, Scan IDs, and More on phones. Administrator tools remain role restricted. NFC is the first scanning method, followed by QR code, search, and ID photo. Unsupported devices receive an explanation and can use another method.

Use direct English labels: expected students, arrived safely, still missing, other arrivals, and waiting to upload. Explain device-only records and server-confirmed records distinctly. Do not hide permissions, errors, connection state, or upload review requirements.

The current deployment uses the existing MySQL/API and Cloudflare HTTPS tunnel. This frontend revision does not change authentication, database schema, or event counting rules.
