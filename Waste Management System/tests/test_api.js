const http = require('http');

// Helper to make requests
function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3005,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (cookie) {
            options.headers['Cookie'] = cookie;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, headers: res.headers, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('--- STARTING BACKEND TESTS ---');

    let adminCookie = null;
    let staffCookie = null;
    let staffId = null;
    const testStaffUser = 'test_staff_' + Date.now();
    const testStaffPass = 'password123';

    // 1. Login as Admin
    console.log('\n1. Testing Admin Login...');
    const adminLogin = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    if (adminLogin.body.success) {
        console.log('✅ Admin Login Success');
        adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];
    } else {
        console.error('❌ Admin Login Failed:', adminLogin.body);
        return;
    }

    // 2. Register New Staff
    console.log(`\n2. Testing Staff Registration (${testStaffUser})...`);
    const regRes = await request('POST', '/api/register', { username: testStaffUser, password: testStaffPass });
    if (regRes.body.success) {
        console.log('✅ Registration Success');
    } else {
        console.error('❌ Registration Failed:', regRes.body);
        return;
    }

    // 3. Login as New Staff
    console.log('\n3. Testing Staff Login...');
    const staffLogin = await request('POST', '/api/login', { username: testStaffUser, password: testStaffPass });
    if (staffLogin.body.success) {
        console.log('✅ Staff Login Success');
        staffCookie = staffLogin.headers['set-cookie'][0].split(';')[0];
    } else {
        console.error('❌ Staff Login Failed:', staffLogin.body);
        return;
    }

    // 4. Admin: Get Staff List & Find New Staff ID
    console.log('\n4. Testing Admin Fetch Staff List...');
    const staffList = await request('GET', '/api/admin/staff-list', null, adminCookie);
    if (Array.isArray(staffList.body)) {
        const newStaff = staffList.body.find(s => s.name === testStaffUser || s.email === testStaffUser);
        if (newStaff) {
            console.log('✅ New Staff Found in List. ID:', newStaff.id);
            staffId = newStaff.id;
        } else {
            console.error('❌ New Staff NOT Found in List');
            console.log('List:', staffList.body);
            return;
        }
    } else {
        console.error('❌ Failed to fetch staff list:', staffList.body);
        return;
    }

    // 5. Admin: Assign Targets
    console.log('\n5. Testing Admin Assign Targets...');
    const targets = [
        { type: 'Waste Collection', value: 50 },
        { type: 'Bins Cleaned', value: 5 },
        { type: 'Areas Covered', value: 2 }
    ];
    const assignRes = await request('POST', '/api/admin/assign-targets', { staff_id: staffId, targets }, adminCookie);
    if (assignRes.body.success) {
        console.log('✅ Targets Assigned Successfully');
    } else {
        console.error('❌ Failed to assign targets:', assignRes.body);
        return;
    }

    // 6. Staff: Check Targets
    console.log('\n6. Testing Staff Check My Targets...');
    const myTargets = await request('GET', '/api/staff/my-progress', null, staffCookie);
    if (Array.isArray(myTargets.body) && myTargets.body.length === 3) {
        console.log('✅ Staff sees 3 targets');
    } else {
        console.error('❌ Staff targets missing or incorrect:', myTargets.body);
        return;
    }

    // 7. Staff: Update Progress
    console.log('\n7. Testing Staff Update Progress...');
    const updateRes = await request('POST', '/api/staff/update-progress', { target_type: 'Waste Collection', increment_value: 10 }, staffCookie);
    if (updateRes.body.success) {
        console.log('✅ Progress Updated Successfully');
    } else {
        console.error('❌ Failed to update progress:', updateRes.body);
        // Continue anyway to see if stats reflect it (if it partially worked)
    }

    // 8. Admin: Check Progress Stats
    console.log('\n8. Testing Admin Check Progress Stats...');
    const statsRes = await request('GET', '/api/admin/staff-progress', null, adminCookie);
    if (Array.isArray(statsRes.body)) {
        const staffStats = statsRes.body.find(s => s.name === testStaffUser);
        if (staffStats) {
            const wasteTarget = staffStats.targets.find(t => t.type === 'Waste Collection');
            if (wasteTarget.completed === 10) {
                console.log('✅ Admin sees correct progress (10/50)');
            } else {
                console.error('❌ Admin sees INCORRECT progress:', wasteTarget);
            }
        } else {
            console.error('❌ Staff not found in stats');
        }
    } else {
        console.error('❌ Failed to fetch admin stats:', statsRes.body);
    }

    // 9. Admin: Delete Staff (Cleanup)
    console.log('\n9. Testing Admin Delete Staff...');
    const delRes = await request('POST', `/api/admin/remove-staff/${staffId}`, { action: 'delete' }, adminCookie);
    if (delRes.body.success) {
        console.log('✅ Staff Deleted Successfully');
    } else {
        console.error('❌ Failed to delete staff:', delRes.body);
    }

    console.log('\n--- TESTS COMPLETED ---');
}

runTests();
