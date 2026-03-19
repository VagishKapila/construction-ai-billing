from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()

templates = Jinja2Templates(directory="app/web/templates")


@router.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@router.get("/projects", response_class=HTMLResponse)
def projects(request: Request):
    return templates.TemplateResponse("projects.html", {"request": request})


@router.get("/projects/{project_id}", response_class=HTMLResponse)
def project_detail(request: Request, project_id: str):
    return templates.TemplateResponse(
        "project_detail.html",
        {"request": request, "project_id": project_id},
    )


@router.get("/projects/{project_id}/pay-apps/new", response_class=HTMLResponse)
def pay_app_new(request: Request, project_id: str):
    return templates.TemplateResponse(
        "pay_app_new.html",
        {"request": request, "project_id": project_id},
    )