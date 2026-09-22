// 预订记录
function getBooks(){
    const raw = localStorage.getItem("ktvBookList");
    return raw ? JSON.parse(raw) : [];
}
function saveBooks(list){
    localStorage.setItem("ktvBookList",JSON.stringify(list));
}

// 客户档案库（自动保存客户姓名+电话）
function getCustomerDB(){
    const raw = localStorage.getItem("ktvCustomerDB");
    return raw ? JSON.parse(raw) : {};
}
function saveCustomerDB(db){
    localStorage.setItem("ktvCustomerDB",JSON.stringify(db));
}

// 输入姓名自动回填电话
function autoFillCustomer(){
    const name = document.getElementById("name").value.trim();
    const db = getCustomerDB();
    if(db[name]){
        document.getElementById("phone").value = db[name];
    }
}

function renderList(){
    const list = getBooks();
    const search = document.getElementById("searchInput").value.toLowerCase();
    const filterDay = document.getElementById("filterDate").value;
    const today = getTodayStr();

    let filtered = list.filter(item=>{
        // 自动过滤：只展示 >=今日 的预约，过期的不显示
        const isNotExpire = item.bookDate >= today;
        const matchSearch = item.name.toLowerCase().includes(search) || item.room.toLowerCase().includes(search) || item.store.toLowerCase().includes(search);
        const matchDate = !filterDay || item.bookDate === filterDay;
        return isNotExpire && matchSearch && matchDate;
    })
    filtered.sort((a,b)=>new Date(a.bookDate)-new Date(b.bookDate));

    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
    filtered.forEach((item,idx)=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.store||""}</td>
            <td>${item.bookDate}</td>
            <td>${item.name}<br>${item.phone||""}</td>
            <td>${item.room}</td>
            <td>${item.timeSlot}</td>
            <td>${item.people||""}</td>
            <td>${item.minConsume||""}</td>
            <td>¥${item.price||0}</td>
            <td>${item.remark||""}</td>
            <td>
                <button onclick="editItem(${idx})">编辑</button>
                <button class="del" onclick="deleteItem(${idx})">删除</button>
            </td>
        `
        tbody.appendChild(tr);
    })
}

// 获取今日日期字符串 yyyy-mm-dd
function getTodayStr(){
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,"0");
    const d = String(now.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
}

// 提交表单，防撞单（同门店+日期+包厢+时段才冲突）
document.getElementById("bookForm").addEventListener("submit",function(e){
    e.preventDefault();
    const list = getBooks();
    const store = document.getElementById("store").value;
    const bookDate = document.getElementById("bookDate").value;
    const room = document.getElementById("room").value;
    const timeSlot = document.getElementById("timeSlot").value;

    // 防撞单：同门店+日期+包厢+时段不能重复
    const conflict = list.some(i=>i.store===store && i.bookDate===bookDate && i.room===room && i.timeSlot===timeSlot);
    if(conflict){
        alert(`⚠️ 冲突！【${store}】${bookDate} ${room} ${timeSlot} 已有预订`);
        return;
    }
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();

    // 自动保存客户档案
    const custDB = getCustomerDB();
    custDB[name] = phone;
    saveCustomerDB(custDB);

    const newItem = {
        store: store,
        name: name,
        phone: phone,
        bookDate: bookDate,
        room: room,
        timeSlot: timeSlot,
        people: document.getElementById("people").value,
        minConsume: document.getElementById("minConsume").value,
        price: document.getElementById("price").value,
        remark: document.getElementById("remark").value
    }
    list.push(newItem);
    saveBooks(list);
    this.reset();
    setDefaultDate();
    renderList();
    alert("✅预订保存成功，客户信息已自动存档");
})

function deleteItem(idx){
    const list = getBooks();
    if(confirm("确定删除这条预订？")){
        list.splice(idx,1);
        saveBooks(list);
        renderList();
    }
}

function editItem(idx){
    const list = getBooks();
    const item = list[idx];
    const store = prompt("门店",item.store);
    if(!store) return;
    item.store = store;
    item.name = prompt("客户姓名",item.name);
    item.phone = prompt("联系方式",item.phone);
    item.bookDate = prompt("预订日期",item.bookDate);
    item.room = prompt("包厢（支持卡座）",item.room);
    item.timeSlot = prompt("时段",item.timeSlot);
    item.people = prompt("人数",item.people);
    item.minConsume = prompt("低消",item.minConsume);
    item.price = prompt("金额",item.price);
    item.remark = prompt("备注",item.remark);
    saveBooks(list);
    renderList();
}

//导出预订备份
function exportData(){
    const data = getBooks();
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ktv预订备份.json";
    a.click();
    URL.revokeObjectURL(url);
}

//导出客户档案
function exportCustomerData(){
    const data = getCustomerDB();
    const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ktv客户档案.json";
    a.click();
    URL.revokeObjectURL(url);
}

// 填充今日日期
function setDefaultDate(){
    document.getElementById("bookDate").value = getTodayStr();
}

//页面加载
window.onload = function(){
    setDefaultDate();
    renderList();
}
