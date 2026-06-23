from django.shortcuts import render
from django.views.decorators.clickjacking import xframe_options_exempt

@xframe_options_exempt
def terminal_view(request):
    """Despacho monolítico puro. Cero lógica de servidor."""
    return render(request, 'core/terminal.html')